/**
 * Парсер исходного CSV-реестра (§5 ТЗ):
 *  - разделитель `;`, кодировка UTF-8 (BOM допускается), переводы строк CRLF;
 *  - кавычки экранируются удвоением (""), поля могут содержать переводы строк;
 *  - структура заголовка трёхуровневая: строка 0 — название колонки,
 *    строка 1 — подзаголовок (Широта/Долгота, дата/номер для ЗОС и АКТА ВВОДА),
 *    строка 2 — числовой номер колонки исходного ведомственного реестра
 *    (номера с пропусками: 1–12, 14–18, 20–27, 30, 58, 65–70, 73, 74).
 * Первые 3 строки пропускаются, парные колонки учитываются в карте COL.
 */

export const CSV_DELIMITER = ';';
export const HEADER_ROWS_TO_SKIP = 3;
export const COLUMN_COUNT = 35;

/** Карта колонок (0-based индексы после склейки заголовка, см. Приложение A ТЗ). */
export const COL = {
  extId: 0,
  grbs: 1,
  name: 2,
  constructionStage: 3,
  address: 4,
  lat: 5,
  lon: 6,
  industry: 7,
  status: 8,
  ownership: 9,
  municipality: 10,
  customer: 11,
  programNpGp: 12,
  programFp: 13,
  projectCode: 14,
  areaM2: 15,
  capacity: 16,
  expertise: 17,
  yearStart: 18,
  yearEnd: 19,
  constructionPeriod: 20,
  landTransferDate: 21,
  permitDate: 22,
  contractDate: 23,
  contractPeriod: 24,
  contractor: 25,
  readinessPct: 26,
  equipmentDate: 27,
  hydraulicTestDate: 28,
  zosDate: 29,
  zosNumber: 30,
  actDate: 31,
  actNumber: 32,
  commissioningYear: 33,
  photo: 34,
} as const;

export type ColumnKey = keyof typeof COL;

/** Заголовки для raw-представления (строка 0 + подзаголовок строки 1). */
export interface ObjectsTable {
  header: string[];
  subheader: string[];
  /** Номера колонок исходного ведомственного реестра (строка 2). */
  sourceColumnNumbers: string[];
  /** Человекочитаемые ключи raw: «Координаты.Широта», «ЗОС.дата» и т. п. */
  rawKeys: string[];
  rows: string[][];
}

/**
 * Разбор текста с разделителем и кавычками (RFC 4180-подобный, экранирование "").
 * Возвращает все строки (включая заголовки). Пустая входная строка → пустой массив.
 */
export function parseDelimited(text: string, delimiter: string = CSV_DELIMITER): string[][] {
  // убираем BOM
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldHadContent = false; // чтобы отличать пустую последнюю строку

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') {
      // кавычка в начале поля — начало quoted-значения
      inQuotes = true;
      fieldHadContent = true;
      continue;
    }
    if (ch === delimiter) {
      pushField();
      fieldHadContent = true;
      continue;
    }
    if (ch === '\r') {
      if (input[i + 1] === '\n') i += 1;
      pushRow();
      fieldHadContent = false;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      fieldHadContent = false;
      continue;
    }
    field += ch;
    fieldHadContent = true;
  }
  // хвост: последнее поле/строка (если файл не закончился переводом строки)
  if (inQuotes) {
    throw new Error('CSV: незакрытая кавычка в конце файла');
  }
  if (field !== '' || fieldHadContent || row.length > 0) {
    pushRow();
  }
  return rows;
}

/**
 * Разбор objects.csv: пропускает 3 строки заголовка, проверяет число колонок.
 * Бросает исключение с номером строки при рассогласовании ширины.
 */
export function parseObjectsCsv(text: string): ObjectsTable {
  const all = parseDelimited(text, CSV_DELIMITER);
  if (all.length <= HEADER_ROWS_TO_SKIP) {
    throw new Error('CSV: не найдены строки данных (ожидалось > 3 строк заголовка)');
  }
  const rawHeader = all[0];
  const subheader = all[1];
  const sourceColumnNumbers = all[2];
  if (rawHeader.length !== COLUMN_COUNT) {
    throw new Error(`CSV: ожидалось ${COLUMN_COUNT} колонок в заголовке, получено ${rawHeader.length}`);
  }
  // Склейка парных колонок: пустая ячейка заголовка наследует предыдущую
  // («Координаты» → Широта/Долгота, «ЗОС» → дата/номер, «АКТ ВВОДА» → дата/номер).
  const header: string[] = [];
  let lastHeader = '';
  for (const cell of rawHeader) {
    const trimmed = cell.trim();
    if (trimmed !== '') lastHeader = trimmed;
    header.push(lastHeader);
  }
  const rawKeys = header.map((h, i) => {
    const sub = (subheader[i] ?? '').trim();
    // заголовок может содержать переводы строк («Мошность\n(кол-во мест)») —
    // схлопываем, чтобы ключ был пригоден для markdown-таблиц и JSON
    const clean = (v: string) => v.replace(/\s+/g, ' ').trim();
    return sub ? `${clean(h)}.${clean(sub)}` : clean(h);
  });

  const rows: string[][] = [];
  for (let r = HEADER_ROWS_TO_SKIP; r < all.length; r += 1) {
    const row = all[r];
    // полностью пустая строка в конце файла допустима
    if (row.every((v) => v.trim() === '') && row.length <= 1) continue;
    if (row.length !== COLUMN_COUNT) {
      throw new Error(
        `CSV: строка ${r + 1} содержит ${row.length} колонок вместо ${COLUMN_COUNT}`,
      );
    }
    rows.push(row);
  }
  return { header, subheader, sourceColumnNumbers, rawKeys, rows };
}

/** Ключи raw-представления объекта (для objects.raw JSONB). */
export function buildRawRecord(rawKeys: string[], row: string[]): Record<string, string> {
  const raw: Record<string, string> = {};
  rawKeys.forEach((key, i) => {
    raw[key] = row[i];
  });
  return raw;
}
