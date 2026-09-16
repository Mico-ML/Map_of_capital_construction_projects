/**
 * Пайплайн геокодирования и контроля качества геометрии (§6.3 ТЗ).
 *
 * Правила (обязательные):
 *  1. Координата из CSV ВСЕГДА приоритетнее результата геокодера;
 *     автоматическая перезапись CSV-координаты запрещена.
 *  2. Кандидат валидируется по цепочке adm_div (район/городской округ);
 *     несовпадение → rejected с фиксацией причины.
 *  3. Автоматически применяются только high/medium; low → очередь модерации.
 *  4. Существующие координаты верифицируются обратным геокодированием
 *     и (детерминированно, без API) тестом «точка внутри полигона МО».
 *  5. Объекты без адреса — населённый пункт извлекается из наименования,
 *     geocode_source='inferred_from_name', пониженное доверие.
 *  6. Объекты без точной геометрии отображаются на центроиде МО
 *     с пометкой «местоположение уточняется» и НЕ участвуют в расчёте
 *     изохрон/«светофора» без явного согласия пользователя.
 */

import type { GeocodeConfidence, GeocodeSource, LngLat, MunicipalitySource } from '@oks/shared';
import { getMunicipalityById } from '@oks/shared';
import type { NormalizedObject } from '../normalize';
import type { MunicipalityGeometry } from '../geo_utils';
import { municipalityContaining } from '../geo_utils';
import type { GeocoderProvider } from './types';
import type { ScoredCandidate } from './scoring';
import { scoreCandidate, selectBestCandidate, normalizePlaceName } from './scoring';

export type GeocodeDecision =
  | 'csv_kept' // координата CSV сохранена и верифицирована
  | 'csv_kept_unverified' // сохранена; верификация требует боевого ключа
  | 'csv_kept_conflict' // сохранена, но конфликтует с МО (точка вне заявленного МО / обратный геокод) — модерация
  | 'geocoded' // координата заполнена геокодером (high/medium)
  | 'geocode_low_confidence' // кандидат есть, но low — только модерация
  | 'geocode_rejected' // все кандидаты отклонены валидатором
  | 'geocode_not_found' // геокодер ничего не вернул
  | 'pending_key' // мок-провайдер: ждём боевой ключ
  | 'inferred_from_name' // НП извлечён из наименования (нет адреса) — центроид МО
  | 'municipality_centroid' // МО известно из колонки/адреса — центроид для отображения
  | 'no_location'; // ни координат, ни МО — геометрию запрашиваем у заказчика

export interface ObjectGeocodeResult {
  sourceRowNumber: number;
  decision: GeocodeDecision;
  /** Точная координата [lon, lat] (CSV или геокодер) либо null. */
  point: LngLat | null;
  geocodeSource: GeocodeSource | null;
  geocodeConfidence: GeocodeConfidence | null;
  /** Точка для отображения: точная либо центроид МО. */
  displayPoint: LngLat | null;
  locationApproximate: boolean;
  municipalityId: string | null;
  municipalitySource: MunicipalitySource | null;
  /** Точка не попадает в заявленное МО (эталонный кейс — объект №7 «Косая гора»). */
  municipalityConflict: boolean;
  candidates: ScoredCandidate[];
  reverseCheck: {
    performed: boolean;
    admDivNames: string[];
    addressName: string | null;
    matchesMunicipality: boolean | null;
  } | null;
  notes: string[];
  needsModeration: boolean;
}

/** Извлечение ожидаемых компонентов адреса для скоринга (НП/улица/дом). */
export function extractExpectedFromAddress(address: string | null): {
  settlement: string | null;
  street: string | null;
  house: string | null;
} {
  if (!address) return { settlement: null, street: null, house: null };
  const parts = address
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  let settlement: string | null = null;
  let street: string | null = null;
  let house: string | null = null;
  for (const part of parts) {
    if (/^(тульская|тульской)\s+(область|обл)/i.test(part)) continue;
    const houseMatch = /^(?:д\.?|дом|з\/у|уч\.?|участок|влад\.?)\s*(\S+)/i.exec(part) ??
      /^(\d+[А-Яа-я]?(?:[-/]\d+[А-Яа-я]?)?)$/.exec(part);
    if (houseMatch && house === null) {
      house = houseMatch[1] ?? null;
      continue;
    }
    if (/^(ул\.?|улица|пр\.?|пр-т|проспект|пер\.?|переулок|ш\.?|шоссе|мкр\.?|микрорайон|тер\.?|территория|наб\.?|пл\.?|б-р|бульвар|дорога)/i.test(part)) {
      if (street === null) street = part;
      continue;
    }
    if (/^(г\.?|город|п\.?|поселок|посёлок|р\.?п\.?|рп|пгт|с\.?|село|д\.?|деревня|н\.?п\.?)/i.test(part)) {
      if (settlement === null) settlement = part.replace(/^(г\.?|город|р\.?п\.?|рп|пгт|п\.?|поселок|посёлок|с\.?|село|д\.?|деревня|н\.?п\.?)\s*/i, '');
      continue;
    }
    if (settlement === null) settlement = part;
  }
  return { settlement, street, house };
}

function municipalityNamesForValidation(municipalityId: string | null): string[] {
  const ref = getMunicipalityById(municipalityId);
  if (!ref) return [];
  const names = [ref.nameFull, ref.nameShort, ref.adminCenter];
  // «Ясногорский муниципальный район» → «Ясногорский район» / «Ясногорский»
  const stem = ref.nameShort.replace(/^г\.\s*/, '');
  names.push(stem, `${stem} район`, `${stem} муниципальный район`, `${stem} муниципальный округ`);
  return names.filter((n) => normalizePlaceName(n).length > 2);
}

export interface PipelineOptions {
  /** Ограничение числа запросов к живому провайдеру (квота демо-ключа). */
  maxLiveRequests?: number;
}

/** Прогон всех объектов через правила §6.3. Детерминирован, идемпотентен. */
export async function runGeocodePipeline(
  objects: NormalizedObject[],
  provider: GeocoderProvider,
  geometries: Map<string, MunicipalityGeometry>,
  options: PipelineOptions = {},
): Promise<ObjectGeocodeResult[]> {
  const results: ObjectGeocodeResult[] = [];
  let liveRequests = 0;

  for (const obj of objects) {
    const notes: string[] = [];
    let municipalityId = obj.municipalityId;
    let municipalitySource = obj.municipalitySource;
    let municipalityConflict = false;
    let needsModeration = false;

    const base = {
      sourceRowNumber: obj.sourceRowNumber,
      candidates: [] as ScoredCandidate[],
      reverseCheck: null as ObjectGeocodeResult['reverseCheck'],
    };

    // ------------------------------------------------------------------
    // 1. Координата из CSV — приоритет. Верификация: PIP + обратный геокод.
    // ------------------------------------------------------------------
    if (obj.lat !== null && obj.lon !== null) {
      const point: LngLat = [obj.lon, obj.lat];
      const containing = municipalityContaining(point, geometries);

      if (containing && municipalityId && containing !== municipalityId) {
        // Эталонный кейс: объект №7 «Косая гора» — точка в Ясногорском районе
        // при заявленном «АМО г. Тула». Перезапись запрещена — только модерация.
        municipalityConflict = true;
        needsModeration = true;
        const claimed = getMunicipalityById(municipalityId)?.nameShort ?? municipalityId;
        const actual = getMunicipalityById(containing)?.nameShort ?? containing;
        notes.push(
          `КОНФЛИКТ ГЕОМЕТРИИ: точка попадает в «${actual}», а заявлено «${claimed}». Координата CSV сохранена, случай отправлен на модерацию (обратное геокодирование: §6.3 п.4).`,
        );
      } else if (!municipalityId && containing) {
        municipalityId = containing;
        municipalitySource = 'geometry';
        notes.push('МО определено по геометрии (ST_Contains-эквивалент)');
      }

      // обратное геокодирование — только живой провайдер
      let decision: GeocodeDecision = 'csv_kept_unverified';
      let confidence: GeocodeConfidence | null = null;
      if (provider.kind === 'live') {
        if ((options.maxLiveRequests ?? Infinity) > liveRequests) {
          liveRequests += 1;
          const rev = await provider.reverse(obj.lat, obj.lon);
          if (rev.status === 'ok') {
            const admDivNames = rev.admDiv.map((d) => d.name);
            const expectedNames = municipalityNamesForValidation(municipalityId);
            const matches =
              expectedNames.length > 0
                ? expectedNames.some((name) =>
                    admDivNames.some((adm) => normalizePlaceName(adm) === normalizePlaceName(name) ||
                      normalizePlaceName(adm).includes(normalizePlaceName(name)) ||
                      normalizePlaceName(name).includes(normalizePlaceName(adm))),
                  )
                : null;
            base.reverseCheck = { performed: true, admDivNames, addressName: rev.addressName, matchesMunicipality: matches };
            if (matches === false) {
              municipalityConflict = true;
              needsModeration = true;
              notes.push(
                `Обратное геокодирование не подтверждает МО: ${rev.addressName ?? admDivNames.join(' / ')}`,
              );
            }
          } else {
            base.reverseCheck = { performed: false, admDivNames: [], addressName: null, matchesMunicipality: null };
            notes.push(`обратное геокодирование не выполнено: ${rev.status}`);
          }
        }
        decision = municipalityConflict ? 'csv_kept_conflict' : 'csv_kept';
        confidence = municipalityConflict ? 'low' : 'high';
      } else {
        notes.push('верификация обратным геокодированием не выполнена (демо-режим без CATALOG_API_KEY)');
        if (municipalityConflict) decision = 'csv_kept_conflict';
      }

      results.push({
        ...base,
        decision,
        point,
        geocodeSource: 'csv',
        geocodeConfidence: confidence ?? (municipalityConflict ? 'low' : null),
        displayPoint: point,
        locationApproximate: false,
        municipalityId,
        municipalitySource,
        municipalityConflict,
        notes,
        needsModeration,
      });
      continue;
    }

    // ------------------------------------------------------------------
    // 2. Без координаты: геокодинг по адресу либо вывод из наименования.
    // ------------------------------------------------------------------
    const centroidOf = municipalityId ? geometries.get(municipalityId)?.centroid ?? null : null;
    const displayPoint = centroidOf;
    const locationApproximate = displayPoint !== null;

    if (obj.addressNormalized || obj.addressRaw) {
      const query = `${obj.addressNormalized ?? obj.addressRaw ?? ''}, Тульская область`;
      if (provider.kind === 'live' && (options.maxLiveRequests ?? Infinity) > liveRequests) {
        liveRequests += 1;
        const response = await provider.geocode(query);
        if (response.status === 'ok' && response.candidates.length > 0) {
          const expectedAddr = extractExpectedFromAddress(obj.addressNormalized ?? obj.addressRaw);
          const expected = {
            municipalityId,
            municipalityNames: municipalityNamesForValidation(municipalityId),
            ...expectedAddr,
          };
          const scored = response.candidates.map((c) => scoreCandidate(c, expected));
          base.candidates = scored;
          const selection = selectBestCandidate(scored);
          if (selection.best && selection.confidence) {
            // без ожидаемого МО валидация по району невозможна → не выше low (§6.3 п.2)
            const confidence: GeocodeConfidence = municipalityId ? selection.confidence : 'low';
            if (confidence === 'high' || confidence === 'medium') {
              const p: LngLat = [selection.best.candidate.point.lon, selection.best.candidate.point.lat];
              results.push({
                ...base,
                decision: 'geocoded',
                point: p,
                geocodeSource: 'geocoder',
                geocodeConfidence: confidence,
                displayPoint: p,
                locationApproximate: false,
                municipalityId,
                municipalitySource,
                municipalityConflict: false,
                notes: [...notes, `кандидат принят: ${selection.best.candidate.fullName} (score ${selection.best.score})`],
                needsModeration: false,
              });
              continue;
            }
            notes.push(`кандидат ${selection.best.candidate.fullName} — низкая уверенность (score ${selection.best.score}), только модерация`);
            results.push({
              ...base,
              decision: 'geocode_low_confidence',
              point: null,
              geocodeSource: null,
              geocodeConfidence: 'low',
              displayPoint,
              locationApproximate,
              municipalityId,
              municipalitySource,
              municipalityConflict: false,
              notes,
              needsModeration: true,
            });
            continue;
          }
          const rejected = scored.filter((s) => s.rejectReason);
          notes.push(
            rejected.length > 0
              ? `все кандидаты отклонены: ${rejected[0]?.rejectReason ?? 'валидатор'}`
              : 'подходящих кандидатов нет',
          );
          results.push({
            ...base,
            decision: 'geocode_rejected',
            point: null,
            geocodeSource: null,
            geocodeConfidence: null,
            displayPoint,
            locationApproximate,
            municipalityId,
            municipalitySource,
            municipalityConflict: false,
            notes,
            needsModeration: true,
          });
          continue;
        }
        if (response.status === 'not_found') {
          notes.push('геокодер не нашёл адрес');
          results.push({
            ...base,
            decision: 'geocode_not_found',
            point: null,
            geocodeSource: null,
            geocodeConfidence: null,
            displayPoint,
            locationApproximate,
            municipalityId,
            municipalitySource,
            municipalityConflict: false,
            notes,
            needsModeration: true,
          });
          continue;
        }
        notes.push(`геокодинг не выполнен: ${response.status}${response.note ? ` (${response.note})` : ''}`);
      } else if (provider.kind !== 'live') {
        notes.push(mockProviderNote());
      } else {
        notes.push('достигнут лимит запросов к геокодеру (maxLiveRequests)');
      }
      // мок/лимит/ошибка: ждём боевой ключ, показываем центроид МО
      results.push({
        ...base,
        decision: provider.kind === 'live' ? 'geocode_not_found' : 'pending_key',
        point: null,
        geocodeSource: null,
        geocodeConfidence: null,
        displayPoint,
        locationApproximate,
        municipalityId,
        municipalitySource,
        municipalityConflict: false,
        notes,
        needsModeration: municipalityId === null,
      });
      continue;
    }

    // --- адреса нет: НП из наименования (§6.3 п.5) ---
    if (municipalityId && obj.municipalitySource === 'inferred_name') {
      results.push({
        ...base,
        decision: 'inferred_from_name',
        point: null,
        geocodeSource: 'inferred_from_name',
        geocodeConfidence: 'low',
        displayPoint,
        locationApproximate: true,
        municipalityId,
        municipalitySource,
        municipalityConflict: false,
        notes: [
          ...notes,
          'адрес отсутствует; МО и точка отображения (центроид) определены по населённому пункту из наименования — геометрию запросить у заказчика',
        ],
        needsModeration: false,
      });
      continue;
    }
    if (municipalityId) {
      results.push({
        ...base,
        decision: 'municipality_centroid',
        point: null,
        geocodeSource: null,
        geocodeConfidence: null,
        displayPoint,
        locationApproximate: true,
        municipalityId,
        municipalitySource,
        municipalityConflict: false,
        notes: [...notes, 'точное местоположение отсутствует — отображается центроид МО («местоположение уточняется»)'],
        needsModeration: true,
      });
      continue;
    }
    results.push({
      ...base,
      decision: 'no_location',
      point: null,
      geocodeSource: null,
      geocodeConfidence: null,
      displayPoint: null,
      locationApproximate: false,
      municipalityId: null,
      municipalitySource: null,
      municipalityConflict: false,
      notes: [...notes, 'ни координат, ни адреса, ни МО — геометрию и привязку запросить у заказчика'],
      needsModeration: true,
    });
  }

  return results;
}

function mockProviderNote(): string {
  return 'геокодинг не выполнялся: демо-режим (GEOCODER_PROVIDER=mock) — координаты не выдумываются, объект в очереди геокодирования';
}
