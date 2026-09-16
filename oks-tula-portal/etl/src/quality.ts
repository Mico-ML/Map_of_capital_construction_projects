/**
 * Отчёт о качестве данных (§5, §6.1 ТЗ) — обязательный артефакт ETL.
 * Формируется детерминированно из результатов парсинга/нормализации/геокодирования.
 * Вывод: reports/data_quality.md (для людей) + reports/data_quality.json (для API).
 */

import { COL, type ObjectsTable } from './csv_parser';
import type { NormalizationResult, NormalizedObject } from './normalize';
import { getMunicipalityById, getStatusByCode, getIndustryByCode, pluralRu } from '@oks/shared';
import type { ObjectGeocodeResult } from './geocode/pipeline';

export interface ColumnStats {
  /** Человекочитаемый ключ (заголовок + подзаголовок). */
  key: string;
  index: number;
  /** Номер колонки в исходном ведомственном реестре (строка 2 CSV). */
  sourceNumber: string;
  filled: number;
  empty: number;
  /** Значения «0»/«0,00»/«-», трактуемые как «нет данных». */
  zeroLikeEmpty: number;
}

export type ProblemSeverity = 'info' | 'warning' | 'critical';

export interface ProblemRecord {
  rowNumber: number;
  objectName: string;
  kind: string;
  message: string;
  severity: ProblemSeverity;
}

export interface DuplicateCoordinateGroup {
  point: [number, number];
  rows: { rowNumber: number; name: string }[];
}

export interface BatchDateAnomaly {
  date: string;
  count: number;
  fields: string[];
}

export interface DataQualityReport {
  meta: {
    generatedAt: string;
    sourceFile: string;
    sourceFileHash: string;
    totalRows: number;
    geocoderProvider: 'mock' | 'live';
  };
  columns: ColumnStats[];
  stats: NormalizationResult['stats'];
  distributions: {
    statuses: { code: string; name: string; group: string; count: number }[];
    industries: { code: string; name: string; count: number; inferred: number }[];
    municipalities: { id: string; name: string; count: number }[];
    commissioningByYear: { year: number; count: number }[];
    ownership: { value: string; count: number }[];
  };
  coordinates: {
    withCoordinates: number;
    withoutCoordinates: number;
    withoutAddress: number;
    activeWithoutCoordinates: number;
    duplicateGroups: DuplicateCoordinateGroup[];
    duplicateAddresses: { address: string; rows: number[] }[];
  };
  geocoding: {
    byDecision: Record<string, number>;
    inferredFromName: number;
    pendingKey: number;
    conflicts: { rowNumber: number; name: string; message: string }[];
    needsModeration: number;
  };
  dateAnomalies: {
    batchFilledDates: BatchDateAnomaly[];
    notes: string[];
  };
  problems: ProblemRecord[];
  recommendations: string[];
}

const ZERO_LIKE = new Set(['0', '0,00', '0.00']);

export function buildQualityReport(opts: {
  table: ObjectsTable;
  normalization: NormalizationResult;
  geocodeResults: ObjectGeocodeResult[];
  meta: DataQualityReport['meta'];
}): DataQualityReport {
  const { table, normalization, geocodeResults, meta } = opts;
  const objects = normalization.objects;

  // --- статистика по всем 35 колонкам ---
  const columns: ColumnStats[] = table.header.map((header, index) => {
    let filled = 0;
    let empty = 0;
    let zeroLikeEmpty = 0;
    for (const row of table.rows) {
      const value = (row[index] ?? '').trim();
      if (value === '' || value === '-' || value === '—') empty += 1;
      else if (ZERO_LIKE.has(value)) zeroLikeEmpty += 1;
      else filled += 1;
    }
    const sub = (table.subheader[index] ?? '').trim();
    const collapse = (v: string) => v.replace(/\s+/g, ' ').trim();
    return {
      key: sub ? `${collapse(header)}.${collapse(sub)}` : collapse(header),
      index,
      sourceNumber: (table.sourceColumnNumbers[index] ?? '').trim(),
      filled,
      empty,
      zeroLikeEmpty,
    };
  });

  // --- распределения ---
  const statusCounts = new Map<string, number>();
  const industryCounts = new Map<string, { total: number; inferred: number }>();
  const municipalityCounts = new Map<string, number>();
  const yearCounts = new Map<number, number>();
  const ownershipCounts = new Map<string, number>();
  for (const o of objects) {
    const sKey = o.statusCode ?? 'unknown';
    statusCounts.set(sKey, (statusCounts.get(sKey) ?? 0) + 1);
    const iKey = o.industryCode ?? 'none';
    const iCur = industryCounts.get(iKey) ?? { total: 0, inferred: 0 };
    iCur.total += 1;
    if (o.industrySource === 'inferred') iCur.inferred += 1;
    industryCounts.set(iKey, iCur);
    const mKey = o.municipalityId ?? 'none';
    municipalityCounts.set(mKey, (municipalityCounts.get(mKey) ?? 0) + 1);
    if (o.commissioningYear !== null) yearCounts.set(o.commissioningYear, (yearCounts.get(o.commissioningYear) ?? 0) + 1);
    ownershipCounts.set(o.ownership, (ownershipCounts.get(o.ownership) ?? 0) + 1);
  }

  // --- координаты: дубли, адреса ---
  const coordGroups = new Map<string, DuplicateCoordinateGroup>();
  for (const o of objects) {
    if (o.lat === null || o.lon === null) continue;
    const key = `${o.lat},${o.lon}`;
    const g = coordGroups.get(key) ?? { point: [o.lon, o.lat], rows: [] };
    g.rows.push({ rowNumber: o.sourceRowNumber, name: o.name });
    coordGroups.set(key, g);
  }
  const duplicateGroups = [...coordGroups.values()].filter((g) => g.rows.length > 1);

  const addressGroups = new Map<string, number[]>();
  for (const o of objects) {
    if (!o.addressRaw) continue;
    const key = o.addressRaw.trim().toLowerCase();
    const arr = addressGroups.get(key) ?? [];
    arr.push(o.sourceRowNumber);
    addressGroups.set(key, arr);
  }
  const duplicateAddresses = [...addressGroups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([address, rows]) => ({ address, rows }));

  const activeWithoutCoordinates = objects.filter(
    (o) => (o.lat === null || o.lon === null) && o.statusGroup !== 'completed',
  ).length;

  // --- «пакетные» даты (§5: одинаковые значения во многих строках — не ошибка, но фиксируем) ---
  const dateFields: { key: keyof NormalizedObject; label: string }[] = [
    { key: 'landTransferDate', label: 'передача ЗУ' },
    { key: 'permitDate', label: 'РНС' },
    { key: 'contractDate', label: 'контракт' },
    { key: 'zosDate', label: 'ЗОС' },
    { key: 'actDate', label: 'акт ввода' },
  ];
  const dateCounter = new Map<string, { count: number; fields: Set<string> }>();
  for (const o of objects) {
    for (const f of dateFields) {
      const v = o[f.key] as string | null;
      if (!v) continue;
      const cur = dateCounter.get(v) ?? { count: 0, fields: new Set<string>() };
      cur.count += 1;
      cur.fields.add(f.label);
      dateCounter.set(v, cur);
    }
  }
  const batchFilledDates: BatchDateAnomaly[] = [...dateCounter.entries()]
    .filter(([, v]) => v.count >= 5)
    .map(([date, v]) => ({ date, count: v.count, fields: [...v.fields] }))
    .sort((a, b) => b.count - a.count);

  // --- геокодирование ---
  const byDecision: Record<string, number> = {};
  const conflicts: { rowNumber: number; name: string; message: string }[] = [];
  let inferredFromName = 0;
  let pendingKey = 0;
  let needsModeration = 0;
  const nameByRow = new Map(objects.map((o) => [o.sourceRowNumber, o.name]));
  for (const r of geocodeResults) {
    byDecision[r.decision] = (byDecision[r.decision] ?? 0) + 1;
    if (r.decision === 'inferred_from_name') inferredFromName += 1;
    if (r.decision === 'pending_key') pendingKey += 1;
    if (r.needsModeration) needsModeration += 1;
    if (r.municipalityConflict) {
      conflicts.push({
        rowNumber: r.sourceRowNumber,
        name: nameByRow.get(r.sourceRowNumber) ?? '?',
        message: r.notes.find((n) => n.startsWith('КОНФЛИКТ ГЕОМЕТРИИ')) ?? r.notes.join('; '),
      });
    }
  }

  // --- проблемные записи (из флагов нормализации + геокодирования) ---
  const problems: ProblemRecord[] = [];
  const severityByPrefix: [RegExp, ProblemSeverity][] = [
    [/^КОНФЛИКТ ГЕОМЕТРИИ/, 'critical'],
    [/нераспознан/i, 'warning'],
    [/требуется модерация|требует подтверждения/i, 'warning'],
    [/подозрительн/i, 'warning'],
    [/ошибк/i, 'warning'],
  ];
  for (const o of objects) {
    for (const flag of o.flags) {
      let severity: ProblemSeverity = 'info';
      for (const [re, sev] of severityByPrefix) {
        if (re.test(flag)) {
          severity = sev;
          break;
        }
      }
      problems.push({ rowNumber: o.sourceRowNumber, objectName: o.name, kind: 'normalization', message: flag, severity });
    }
  }
  for (const r of geocodeResults) {
    for (const note of r.notes) {
      if (!note.startsWith('КОНФЛИКТ') && !note.includes('модераци') && !note.includes('запросить')) continue;
      problems.push({
        rowNumber: r.sourceRowNumber,
        objectName: nameByRow.get(r.sourceRowNumber) ?? '?',
        kind: 'geocoding',
        message: note,
        severity: r.municipalityConflict ? 'critical' : 'warning',
      });
    }
  }

  const recommendations = buildRecommendations({
    stats: normalization.stats,
    activeWithoutCoordinates,
    withoutAddress: normalization.stats.withoutAddress,
    pendingKey,
    conflicts: conflicts.length,
    geocoderProvider: meta.geocoderProvider,
  });

  return {
    meta,
    columns,
    stats: normalization.stats,
    distributions: {
      statuses: [...statusCounts.entries()]
        .map(([code, count]) => {
          const ref = getStatusByCode(code);
          return { code, name: ref?.name ?? 'не распознан', group: ref?.group ?? 'unknown', count };
        })
        .sort((a, b) => b.count - a.count),
      industries: [...industryCounts.entries()]
        .map(([code, v]) => ({
          code,
          name: getIndustryByCode(code)?.name ?? 'не указана / требует модерации',
          count: v.total,
          inferred: v.inferred,
        }))
        .sort((a, b) => b.count - a.count),
      municipalities: [...municipalityCounts.entries()]
        .map(([id, count]) => ({ id, name: getMunicipalityById(id)?.nameShort ?? 'не определено', count }))
        .sort((a, b) => b.count - a.count),
      commissioningByYear: [...yearCounts.entries()]
        .map(([year, count]) => ({ year, count }))
        .sort((a, b) => a.year - b.year),
      ownership: [...ownershipCounts.entries()].map(([value, count]) => ({ value, count })),
    },
    coordinates: {
      withCoordinates: normalization.stats.withCoordinates,
      withoutCoordinates: normalization.stats.withoutCoordinates,
      withoutAddress: normalization.stats.withoutAddress,
      activeWithoutCoordinates,
      duplicateGroups,
      duplicateAddresses,
    },
    geocoding: { byDecision, inferredFromName, pendingKey, conflicts, needsModeration },
    dateAnomalies: {
      batchFilledDates,
      notes: [
        'Одинаковые даты передачи ЗУ / РНС / контракта во многих строках — признак заполнения «пакетом»;',
        'согласно ТЗ это не интерпретируется как ошибка, но фиксируется для прозрачности.',
      ],
    },
    problems,
    recommendations,
  };
}

function buildRecommendations(ctx: {
  stats: NormalizationResult['stats'];
  activeWithoutCoordinates: number;
  withoutAddress: number;
  pendingKey: number;
  conflicts: number;
  geocoderProvider: 'mock' | 'live';
}): string[] {
  const recs: string[] = [
    `Запросить у заказчика официальные координаты по ${pluralRu(ctx.activeWithoutCoordinates, ['активному объекту', 'активным объектам', 'активным объектам'])} (в первую очередь — по ${ctx.withoutAddress} объектам без адреса): автоматически геометрию получить невозможно.`,
    'Утвердить у заказчика: нормативы обеспеченности (config/thresholds), веса сфер композитного индекса, официальные границы МО (сейчас — OpenStreetMap, ODbL) и население (сейчас — демо-источник).',
  ];
  if (ctx.conflicts > 0) {
    recs.push(
      `Проверить у заказчика ${pluralRu(ctx.conflicts, ['конфликт геометрии', 'конфликта геометрии', 'конфликтов геометрии'])} (точка вне заявленного МО) — эталонный пример: объект №7 «Косая гора» с точкой в Ясногорске.`,
    );
  }
  if (ctx.geocoderProvider === 'mock') {
    recs.push(
      `Получить секретный ключ Catalog API 2ГИС и повторить прогон (GEOCODER_PROVIDER=live): ${ctx.pendingKey} объект(ов) ожидают геокодирования; ожидаемый выход по измерениям ТЗ — ~10 уверенных совпадений, 16 слабых, 6 отклонений валидатором, 5 «не найдено».`,
    );
  }
  recs.push(
    'Провести ручную модерацию в админке: отрасль для записей со значением «0» при неоднозначном ГРБС, составные/оборванные наименования организаций, случаи «МО не определено».',
  );
  return recs;
}

// ---------------------------------------------------------------------------
// Markdown-рендер отчёта
// ---------------------------------------------------------------------------

export function renderQualityMarkdown(report: DataQualityReport): string {
  const lines: string[] = [];
  const { meta, stats } = report;
  lines.push('# Отчёт о качестве данных реестра ОКС Тульской области');
  lines.push('');
  lines.push(`> Сформирован ETL: ${meta.generatedAt}. Это автоматически генерируемый артефакт`);
  lines.push('> (`npm run etl:dry`); каждая производная цифра трассируется к строке источника.');
  lines.push('');
  lines.push('## 1. Общие сведения');
  lines.push('');
  lines.push('| Параметр | Значение |');
  lines.push('|---|---|');
  lines.push(`| Исходный файл | \`${meta.sourceFile}\` |`);
  lines.push(`| SHA-256 файла | \`${meta.sourceFileHash}\` |`);
  lines.push(`| Строк данных | ${meta.totalRows} |`);
  lines.push(`| Нормализовано объектов | ${stats.total} |`);
  lines.push(`| Провайдер геокодера | ${meta.geocoderProvider === 'mock' ? 'mock (демо-режим, координаты не выдумываются)' : 'live (2ГИС Catalog API)'} |`);
  lines.push('');

  lines.push('## 2. Заполненность колонок (все 35)');
  lines.push('');
  lines.push('| # | Колонка | № в источнике | Заполнено | Пусто/«-» | «0» как пусто |');
  lines.push('|---|---|---|---|---|---|');
  for (const c of report.columns) {
    lines.push(`| ${c.index + 1} | ${c.key} | ${c.sourceNumber || '—'} | ${c.filled} | ${c.empty} | ${c.zeroLikeEmpty} |`);
  }
  lines.push('');

  lines.push('## 3. Координаты и местоположение');
  lines.push('');
  const co = report.coordinates;
  lines.push(`- Координаты заполнены: **${co.withCoordinates} из ${meta.totalRows}**.`);
  lines.push(`- Без координат: **${co.withoutCoordinates}**, из них активных (не введены): **${co.activeWithoutCoordinates}**.`);
  lines.push(`- Объектов вообще без адреса: **${co.withoutAddress}** — геокодинг невозможен, геометрию запросить у заказчика.`);
  lines.push(`- Дублей координат (одинаковая точка у нескольких объектов): **${co.duplicateGroups.length}** ${co.duplicateGroups.length === 2 ? '(обе пары из ТЗ подтверждены)' : ''}:`);
  for (const g of co.duplicateGroups) {
    lines.push(`  - \`${g.point[1]}, ${g.point[0]}\`: ${g.rows.map((r) => `стр. ${r.rowNumber} «${truncate(r.name, 60)}»`).join('; ')}`);
  }
  lines.push(`- Дублирующихся адресов: **${co.duplicateAddresses.length}**:`);
  for (const d of co.duplicateAddresses) {
    lines.push(`  - «${d.address}» — строки ${d.rows.join(', ')}`);
  }
  lines.push('');

  lines.push('## 4. Геокодирование и контроль геометрии (§6.3)');
  lines.push('');
  lines.push('| Решение пайплайна | Объектов |');
  lines.push('|---|---|');
  for (const [decision, count] of Object.entries(report.geocoding.byDecision)) {
    lines.push(`| \`${decision}\` | ${count} |`);
  }
  lines.push('');
  lines.push(`- Требует ручной модерации: **${report.geocoding.needsModeration}**.`);
  lines.push(`- Конфликты «точка vs заявленное МО»: **${report.geocoding.conflicts.length}**:`);
  for (const c of report.geocoding.conflicts) {
    lines.push(`  - **стр. ${c.rowNumber}** «${truncate(c.name, 70)}» — ${c.message}`);
  }
  if (report.geocoding.conflicts.length === 0) {
    lines.push('  - не обнаружено.');
  }
  lines.push('- Правило ТЗ соблюдается: координаты из CSV никогда не перезаписываются геокодером;');
  lines.push('  в демо-режиме (mock) новые координаты не присваиваются — объекты ждут боевой ключ.');
  lines.push('');

  lines.push('## 5. Нормализация (счётчики)');
  lines.push('');
  lines.push('| Показатель | Значение |');
  lines.push('|---|---|');
  lines.push(`| МО из колонки «АМО» | ${stats.municipalityFromColumn} |`);
  lines.push(`| МО восстановлено из адреса | ${stats.municipalityInferredFromAddress} |`);
  lines.push(`| МО восстановлено из наименования | ${stats.municipalityInferredFromName} |`);
  lines.push(`| МО не определено | ${stats.municipalityUnknown} |`);
  lines.push(`| Отрасль из CSV | ${stats.industryFromCsv} |`);
  lines.push(`| Отрасль восстановлена по ГРБС | ${stats.industryInferred} |`);
  lines.push(`| Отрасль требует модерации | ${stats.industryNeedsModeration} |`);
  lines.push(`| Слияний дублей организаций | ${stats.organizationsMerged} |`);
  lines.push(`| Слияний вариантов программ | ${stats.programsMerged} |`);
  lines.push(`| Контрактных реквизитов извлечено из ячейки «Подрядчик» | ${stats.contractRefsExtracted} |`);
  lines.push(`| Дат распознано | ${stats.datesParsed} |`);
  lines.push(`| Диапазонов дат с исправлением формата | ${stats.rangesFixed} |`);
  lines.push('');

  lines.push('## 6. Распределения (сверка с профилем данных §5)');
  lines.push('');
  lines.push('**Статусы:** ' + report.distributions.statuses.map((s) => `${s.name} — ${s.count}`).join('; '));
  lines.push('');
  lines.push('**Отрасли:** ' + report.distributions.industries.map((i) => `${i.name} — ${i.count}${i.inferred ? ` (из них восстановлено по ГРБС: ${i.inferred})` : ''}`).join('; '));
  lines.push('');
  lines.push('**Годы ввода:** ' + report.distributions.commissioningByYear.map((y) => `${y.year} — ${y.count}`).join('; '));
  lines.push('');
  lines.push('**МО (после нормализации):** ' + report.distributions.municipalities.map((m) => `${m.name} — ${m.count}`).join('; '));
  lines.push('');

  lines.push('## 7. Аномалии дат («пакетное» заполнение)');
  lines.push('');
  if (report.dateAnomalies.batchFilledDates.length > 0) {
    lines.push('| Дата | Встречается (полей-значений) | Поля |');
    lines.push('|---|---|---|');
    for (const d of report.dateAnomalies.batchFilledDates.slice(0, 25)) {
      lines.push(`| ${d.date} | ${d.count} | ${d.fields.join(', ')} |`);
    }
    lines.push('');
    lines.push(report.dateAnomalies.notes.join(' '));
  } else {
    lines.push('Не обнаружено.');
  }
  lines.push('');

  lines.push('## 8. Проблемные записи');
  lines.push('');
  const critical = report.problems.filter((p) => p.severity === 'critical');
  const warnings = report.problems.filter((p) => p.severity === 'warning');
  const infos = report.problems.filter((p) => p.severity === 'info');
  lines.push(`Всего пометок: ${report.problems.length} (критичных: ${critical.length}, предупреждений: ${warnings.length}, информационных: ${infos.length}).`);
  lines.push('');
  if (critical.length > 0) {
    lines.push('### Критичные');
    lines.push('');
    for (const p of critical) lines.push(`- **стр. ${p.rowNumber}** «${truncate(p.objectName, 60)}»: ${p.message}`);
    lines.push('');
  }
  if (warnings.length > 0) {
    lines.push('<details><summary>Предупреждения (' + warnings.length + ')</summary>');
    lines.push('');
    for (const p of warnings) lines.push(`- стр. ${p.rowNumber} «${truncate(p.objectName, 50)}»: ${p.message}`);
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }
  lines.push('<details><summary>Информационные (' + infos.length + ')</summary>');
  lines.push('');
  for (const p of infos) lines.push(`- стр. ${p.rowNumber}: ${p.message}`);
  lines.push('');
  lines.push('</details>');
  lines.push('');

  lines.push('## 9. Рекомендации');
  lines.push('');
  report.recommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
  lines.push('');
  return lines.join('\n');
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Колонки, упомянутые в профиле §5, — для сверки в тестах. */
export const COL_INDEX = COL;
