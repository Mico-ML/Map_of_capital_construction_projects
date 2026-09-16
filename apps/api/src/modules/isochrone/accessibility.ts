import {
  ACCESSIBILITY_THRESHOLDS,
  ISOCHRONE_DISCLAIMER_LIVE,
  ISOCHRONE_DISCLAIMER_MOCK,
  POI_SPHERES,
  SPHERE_LABELS,
  WALKING_SPEED_MPS,
  classifyPoiItem,
  durationLabelRu,
  estimateWalkMinutes,
  haversineM,
  m2ToKm2,
  multiPolygonAreaM2,
  pointInMultiPolygon,
  reverseToDirection,
  type AccessibilityItem,
  type AccessibilityMetric,
  type AccessibilityReport,
  type AccessibilityVerdict,
  type IsochroneZone,
  type LngLat,
  type PoiGroup,
  type SphereCode,
} from '@oks/shared';
import type { PoiSearchItem, PoiSearchResult } from '../../integrations/2gis/types';

/**
 * Расчёт отчёта доступности (§7 Ф4). Чистые функции без NestJS/Prisma —
 * покрыты unit-тестами (§3, §15.6: бизнес-логика отдельно от компонентов).
 *
 * Принципы честности данных (§15.1, §8):
 *  - чего нет — `null` + `gapReason`, в UI «Нет данных»;
 *  - у каждого числа — метод и источник;
 *  - расстояние до соседних объектов — ПО ПРЯМОЙ (гаверсинус), время — оценка
 *    по скорости пешехода; это не маршрут по пешеходной сети (Routing API
 *    на текущей подписке недоступен — §4.6, HTTP 418);
 *  - демо-режим помечается `isMock` и отдельным дисклеймером.
 */

/** Объект реестра ОКС той же сферы (реальные данные, не мок). */
export interface RegistryPeer {
  id: string;
  name: string;
  sphere: SphereCode | null;
  point: LngLat;
  municipalityId: string | null;
  statusName: string | null;
}

export interface MunicipalityFacts {
  population: number | null;
  areaKm2: number | null;
  densityPerKm2: number | null;
  populationSource: string | null;
  populationYear: number | null;
  populationIsMock: boolean;
}

export interface ReportInput {
  object: {
    id: string;
    name: string;
    sphere: SphereCode | null;
    industryName: string | null;
    municipalityId: string | null;
    municipalityName: string | null;
    point: LngLat;
  };
  zone: IsochroneZone | null;
  reverse: boolean;
  municipality: MunicipalityFacts | null;
  /** Результаты Search API по сферам (в демо-режиме — provider_mock). */
  poiResults: PoiSearchResult[];
  /** Объекты реестра ОКС той же сферы рядом с зоной. */
  peers: RegistryPeer[];
  poiProviderKind: 'mock' | 'live';
  generatedAt: string;
}

/** Площадь зоны, м² (из кэша БД либо пересчёт по геометрии). */
export function zoneAreaM2(zone: IsochroneZone | null): number | null {
  if (!zone) return null;
  if (zone.areaM2 !== null && Number.isFinite(zone.areaM2)) return zone.areaM2;
  return multiPolygonAreaM2(zone.geometry);
}

/** Оценка числа жителей в зоне: плотность МО × площадь зоны. */
export function estimatePopulationInZone(
  areaKm2: number | null,
  municipality: MunicipalityFacts | null,
): AccessibilityMetric {
  const density = municipality?.densityPerKm2 ?? null;
  if (areaKm2 === null || density === null) {
    return {
      value: null,
      unit: 'чел.',
      method: 'плотность населения МО × площадь зоны доступности',
      source: municipality?.populationSource ?? 'Нет данных',
      isMock: municipality?.populationIsMock ?? false,
      gapReason: 'no_data',
    };
  }
  const value = Math.round(density * areaKm2);
  return {
    value,
    unit: 'чел.',
    method:
      `плотность населения МО (${Math.round(density)} чел./км²) × площадь зоны (${areaKm2.toFixed(3)} км²). ` +
      'Оценка равномерного распределения: фактическое расселение внутри зоны может отличаться.',
    source: `${municipality?.populationSource ?? 'источник не указан'}${
      municipality?.populationYear ? `, ${municipality.populationYear} г.` : ''
    }`,
    isMock: municipality?.populationIsMock ?? false,
    gapReason: null,
  };
}

/** POI-снимок: результаты Search API → группы по сферам + жильё. */
export function buildPoiGroups(
  poiResults: PoiSearchResult[],
  objectPoint: LngLat,
  zone: IsochroneZone | null,
  poiProviderKind: 'mock' | 'live',
): PoiGroup[] {
  const spheres: (SphereCode | 'residential')[] = [...POI_SPHERES, 'residential'];
  const groups: PoiGroup[] = [];

  for (const sphere of spheres) {
    const result = poiResults.find((r) => r.sphere === sphere);
    if (!result) continue;
    if (result.status === 'provider_mock') {
      groups.push({
        sphere,
        label: SPHERE_LABELS[sphere],
        count: null,
        isMock: true,
        source: 'POI_PROVIDER=mock (нет CATALOG_API_KEY)',
        gapReason: 'provider_mock',
        items: [],
        matchedBy: [],
      });
      continue;
    }
    const items = result.items.map((item) => toAccessibilityItem(item, sphere, objectPoint, zone));
    groups.push({
      sphere,
      label: SPHERE_LABELS[sphere],
      count: items.length,
      isMock: result.isMock,
      source:
        result.method === 'polygon'
          ? 'Search API 2ГИС, фильтр polygon (WKT изохроны)'
          : 'Search API 2GIS, point+radius с постфильтрацией по полигону',
      gapReason: null,
      items: items.sort(byDistance),
      matchedBy: buildMatchedBy(result),
    });
  }

  // если провайдер боевой, но по части сфер запросов не было — помечаем как не рассчитано
  if (poiProviderKind === 'live') {
    for (const sphere of spheres) {
      if (!groups.some((g) => g.sphere === sphere)) {
        groups.push({
          sphere,
          label: SPHERE_LABELS[sphere],
          count: null,
          isMock: false,
          source: 'не запрашивалось',
          gapReason: 'not_calculated',
          items: [],
          matchedBy: [],
        });
      }
    }
  }
  return groups;
}

function buildMatchedBy(result: PoiSearchResult): string[] {
  const parts = result.queries.map((q) => `q=«${q}»`);
  parts.push(`метод: ${result.method}`);
  parts.push('сопоставление: items.rubrics[].alias / items.purpose_name (config/poi_rubrics.ts)');
  return parts;
}

function toAccessibilityItem(
  item: PoiSearchItem,
  sphere: SphereCode | 'residential',
  objectPoint: LngLat,
  zone: IsochroneZone | null,
): AccessibilityItem {
  const distanceM = item.point ? Math.round(haversineM(objectPoint, item.point)) : null;
  return {
    id: item.id,
    name: item.name || 'Без названия',
    sphere,
    origin: '2gis',
    point: item.point,
    address: item.address,
    distanceM,
    walkMinutes: estimateWalkMinutes(distanceM),
    insideZone: Boolean(item.point && zone && pointInMultiPolygon(item.point, zone.geometry)),
    rubricAliases: item.rubricAliases,
    purposeName: item.purposeName,
    registryObjectId: null,
    statusName: null,
    isMock: false,
  };
}

function byDistance(a: AccessibilityItem, b: AccessibilityItem): number {
  return (a.distanceM ?? Number.MAX_SAFE_INTEGER) - (b.distanceM ?? Number.MAX_SAFE_INTEGER);
}

/** Объекты реестра той же сферы → элементы отчёта с расстоянием и оценкой времени. */
export function buildRegistryPeers(
  peers: RegistryPeer[],
  objectPoint: LngLat,
  zone: IsochroneZone | null,
  limit = ACCESSIBILITY_THRESHOLDS.nearestPeersShown,
): { inside: AccessibilityItem[]; nearest: AccessibilityItem[] } {
  const items: AccessibilityItem[] = peers.map((p) => {
    const distanceM = Math.round(haversineM(objectPoint, p.point));
    return {
      id: p.id,
      name: p.name,
      sphere: p.sphere ?? 'other',
      origin: 'registry',
      point: p.point,
      address: null,
      distanceM,
      walkMinutes: estimateWalkMinutes(distanceM),
      insideZone: Boolean(zone && pointInMultiPolygon(p.point, zone.geometry)),
      rubricAliases: [],
      purposeName: null,
      registryObjectId: p.id,
      statusName: p.statusName,
      isMock: false,
    };
  });
  const inside = items
    .filter((i) => i.insideZone)
    .sort(byDistance)
    .slice(0, limit);
  const nearest = items
    .filter((i) => !i.insideZone)
    .sort(byDistance)
    .slice(0, limit);
  return { inside, nearest };
}

/** Вердикт отчёта доступности (§7 Ф4) — правила и трассируемость к фактам. */
export function buildVerdict(input: {
  zone: IsochroneZone | null;
  sphere: SphereCode | null;
  municipalityName: string | null;
  insidePeers: AccessibilityItem[];
  nearestPeers: AccessibilityItem[];
  population: AccessibilityMetric;
  residential: AccessibilityMetric;
  poiProviderKind: 'mock' | 'live';
  isochroneIsMock: boolean;
}): AccessibilityVerdict {
  const {
    zone,
    sphere,
    municipalityName,
    insidePeers,
    nearestPeers,
    population,
    residential,
    poiProviderKind,
    isochroneIsMock,
  } = input;

  const confidence: AccessibilityVerdict['confidence'] = isochroneIsMock
    ? 'low'
    : poiProviderKind === 'live' && !population.isMock
      ? 'high'
      : 'medium';

  if (!zone) {
    return {
      code: 'insufficient_data',
      title: 'Нет данных для вердикта',
      explanation:
        'Зона пешей доступности не построена, поэтому сопоставление с существующими объектами и охватом населения невозможно.',
      basis: ['зона доступности отсутствует'],
      confidence: 'low',
    };
  }

  const zoneLabel = durationLabelRu(zone.durationSec);
  const moName = municipalityName ? `в МО «${municipalityName}»` : 'в муниципальном образовании';
  const basis: string[] = [
    `зона пешей доступности ${zoneLabel} (${isochroneIsMock ? 'демо-модель' : 'пешеходная сеть 2ГИС'})`,
    population.value !== null
      ? `оценка жителей в зоне: ${population.value} чел. (${population.source})`
      : 'число жителей в зоне: нет данных',
  ];
  if (residential.value !== null) basis.push(`жилых домов в зоне: ${residential.value}`);

  // 1) дублирование: объект той же сферы уже в зоне и близко
  const closePeer = insidePeers.find((p) => (p.distanceM ?? Infinity) <= ACCESSIBILITY_THRESHOLDS.peerDuplicateM);
  if (sphere && closePeer) {
    basis.push(
      `объект той же сферы в зоне: «${closePeer.name}» на расстоянии ${closePeer.distanceM} м (по прямой)`,
    );
    return {
      code: 'duplicates',
      title: 'Возможное дублирование существующего объекта',
      explanation:
        `В зоне пешей доступности ${zoneLabel} уже есть объект сферы «${sphereLabel(sphere)}» — ` +
        `«${closePeer.name}» (${closePeer.distanceM} м по прямой, порог ${ACCESSIBILITY_THRESHOLDS.peerDuplicateM} м). ` +
        'Рекомендуется проверить фактическую загрузку существующего объекта до принятия решения. ' +
        'Важно: реестр ОКС не содержит всех действующих объектов социальной инфраструктуры — ' +
        'полная картина требует POI 2ГИС (боевой режим) и индекса обеспеченности МО (Ф5).',
      basis,
      confidence,
    };
  }

  // 2) закрывает дефицит: людей достаточно, ближайшего объекта сферы рядом нет
  const nearestDistance = nearestPeers[0]?.distanceM ?? insidePeers[0]?.distanceM ?? null;
  const populationOk = (population.value ?? 0) >= ACCESSIBILITY_THRESHOLDS.minPopulationInZone;
  if (sphere && populationOk && (nearestDistance === null || nearestDistance >= ACCESSIBILITY_THRESHOLDS.peerFarM)) {
    basis.push(
      nearestDistance === null
        ? `объектов сферы «${sphereLabel(sphere)}» в реестре ОКС в пределах ${Math.round(ACCESSIBILITY_THRESHOLDS.peerFarM / 1000)} км не найдено`
        : `ближайший объект сферы «${sphereLabel(sphere)}» в реестре ОКС — ${nearestDistance} м (по прямой)`,
    );
    return {
      code: 'closes_deficit',
      title: `Закрывает дефицит ${moName} (оценка)`,
      explanation:
        `Зона пешей доступности ${zoneLabel} охватывает ориентировочно ${population.value} чел., ` +
        'при этом ближайший объект той же сферы по реестру ОКС находится за порогом ' +
        `${ACCESSIBILITY_THRESHOLDS.peerFarM} м. Объект повышает доступность услуги ${moName}. ` +
        'Оценка требует подтверждения индексом обеспеченности МО (Ф5) и данными POI 2ГИС.',
      basis,
      confidence,
    };
  }

  // 3) базовый случай — улучшает доступность
  if (nearestDistance !== null) {
    basis.push(`ближайший объект той же сферы по реестру ОКС — ${nearestDistance} м (по прямой)`);
  } else {
    basis.push('данные о соседних объектах сферы отсутствуют — вердикт предварительный');
  }
  return {
    code: 'improves',
    title: 'Улучшает пешую доступность',
    explanation:
      `Объект создаёт зону пешей доступности ${zoneLabel}. Оснований для вывода о дублировании нет, ` +
      'но и признаков выраженного дефицита по доступным данным не выявлено — требуется уточнение ' +
      'по POI 2ГИС и индексу обеспеченности МО (Ф5).',
    basis,
    confidence,
  };
}

function sphereLabel(sphere: SphereCode): string {
  return SPHERE_LABELS[sphere].split(' (')[0];
}

/** Пояснение методики для тултипа (§7 Ф4: вердикт «с пояснением методики»). */
export function buildMethodology(input: {
  zone: IsochroneZone | null;
  reverse: boolean;
  isochroneIsMock: boolean;
  poiProviderKind: 'mock' | 'live';
  poiResults: PoiSearchResult[];
  peersCount: number;
}): string[] {
  const lines: string[] = [];
  lines.push(
    input.isochroneIsMock || !input.zone
      ? 'Зона доступности: демо-модель (радиус = время × скорость пешехода ' +
          `${WALKING_SPEED_MPS} м/с + детерминированный «рельеф»), НЕ расчёт по пешеходной сети 2ГИС.`
      : 'Зона доступности: Isochrone API 2ГИС, /isochrone/2.0.0, transport=walking, ' +
          `reverse=${input.reverse} (${input.reverse ? '«к объекту»' : '«от объекта»'}), геометрия WKT → GeoJSON, кэш в PostGIS 30 суток.`,
  );
  lines.push('Площадь зоны: PostGIS ST_Area(geom::geography), м² → км².');
  lines.push(
    'Жители в зоне: плотность населения МО × площадь зоны. Население — из data/mock/population.csv ' +
      '(демо-данные, помечены); боевой источник — Росстат/операторы связи (этап 2).',
  );
  lines.push(
    input.poiProviderKind === 'live'
      ? `POI: Search API 2ГИС /3.0/items, region_id=36, фильтр polygon (WKT изохроны), рубрики из config/poi_rubrics.ts; ` +
          `запросов: ${input.poiResults.reduce((s, r) => s + r.pagesFetched, 0)}, метод: ${input.poiResults.map((r) => r.method).join(', ') || '—'}.`
      : 'POI 2ГИС: в демо-режиме не запрашиваются (нет CATALOG_API_KEY) — «Нет данных». Объекты каталога не выдумываются (§15.1).',
  );
  lines.push(
    `Объекты той же сферы: реестр ОКС (${input.peersCount} записей с геометрией в радиусе поиска). ` +
      'Расстояние — по прямой (гаверсинус), время — оценка distance / 1,1 м/с; это НЕ пешеходный маршрут ' +
      '(Routing API на текущей подписке недоступен — §4.6, HTTP 418).',
  );
  lines.push(
    `Пороги вердикта: config/isochrone.ts → ACCESSIBILITY_THRESHOLDS ` +
      `(дублирование ≤ ${ACCESSIBILITY_THRESHOLDS.peerDuplicateM} м, «закрывает дефицит» при удалённости ≥ ${ACCESSIBILITY_THRESHOLDS.peerFarM} м ` +
      `и населении в зоне ≥ ${ACCESSIBILITY_THRESHOLDS.minPopulationInZone} чел.). Значения требуют утверждения заказчиком.`,
  );
  lines.push(
    'Ограничение: реестр ОКС описывает объекты капитального строительства, а не полную сеть социальной ' +
      'инфраструктуры. Вердикт уточняется индексом обеспеченности МО (Ф5, итерация 5).',
  );
  return lines;
}

/** Сборка полного отчёта доступности. */
export function buildAccessibilityReport(input: ReportInput): AccessibilityReport {
  const areaM2 = zoneAreaM2(input.zone);
  const areaKm2 = m2ToKm2(areaM2);
  const population = estimatePopulationInZone(areaKm2, input.municipality);
  const groups = buildPoiGroups(input.poiResults, input.object.point, input.zone, input.poiProviderKind);
  const residentialGroup = groups.find((g) => g.sphere === 'residential');
  const residential: AccessibilityMetric = {
    value: residentialGroup?.count ?? null,
    unit: 'домов',
    method: 'подсчёт зданий рубрики «жилой дом» внутри зоны (Search API 2ГИС, фильтр polygon)',
    source: residentialGroup?.source ?? 'Нет данных',
    isMock: residentialGroup?.isMock ?? false,
    gapReason: residentialGroup?.gapReason ?? 'no_data',
  };

  const sphere = input.object.sphere;
  const peers = sphere ? input.peers.filter((p) => p.sphere === sphere) : [];
  const { inside, nearest } = buildRegistryPeers(peers, input.object.point, input.zone);

  const verdict = buildVerdict({
    zone: input.zone,
    sphere,
    municipalityName: input.object.municipalityName,
    insidePeers: inside,
    nearestPeers: nearest,
    population,
    residential,
    poiProviderKind: input.poiProviderKind,
    isochroneIsMock: input.zone?.isMock ?? true,
  });

  const isMock = (input.zone?.isMock ?? false) || input.poiProviderKind === 'mock';
  // Суммарное число социальных POI (без жилья): null, если ни одна группа не подсчитана
  const socialGroups = groups.filter((g) => g.sphere !== 'residential');
  const poiTotal = socialGroups.every((g) => g.count === null)
    ? null
    : socialGroups.reduce((sum, g) => sum + (g.count ?? 0), 0);

  return {
    objectId: input.object.id,
    objectName: input.object.name,
    municipalityId: input.object.municipalityId,
    municipalityName: input.object.municipalityName,
    sphere,
    industryName: input.object.industryName,
    transport: 'walking',
    reverse: input.reverse,
    direction: reverseToDirection(input.reverse),
    durationSec: input.zone?.durationSec ?? 0,
    zone: input.zone,
    zoneAreaKm2: areaKm2,
    population,
    residentialBuildings: residential,
    poi: groups,
    poiTotal,
    sameSphere: {
      inside,
      nearest,
      registryTotalInMunicipality:
        input.object.municipalityId === null
          ? null
          : peers.filter((p) => p.municipalityId === input.object.municipalityId).length,
    },
    verdict,
    methodology: buildMethodology({
      zone: input.zone,
      reverse: input.reverse,
      isochroneIsMock: input.zone?.isMock ?? true,
      poiProviderKind: input.poiProviderKind,
      poiResults: input.poiResults,
      peersCount: peers.length,
    }),
    disclaimer: input.zone?.isMock ? ISOCHRONE_DISCLAIMER_MOCK : ISOCHRONE_DISCLAIMER_LIVE,
    provider: input.poiProviderKind,
    isMock,
    generatedAt: input.generatedAt,
    approximateLocation: false,
  };
}

/** Классификация произвольного POI по конфигу рубрик (используется в тестах и сервисе). */
export { classifyPoiItem };
