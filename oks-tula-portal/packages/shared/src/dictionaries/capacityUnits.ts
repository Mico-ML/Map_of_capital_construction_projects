/**
 * Справочник единиц мощности (Приложение B ТЗ), расширенный по фактическим
 * значениям реестра: дополнительно зафиксированы «Гкал/ч» и «посещения в смену».
 * Базовая единица для «голых» чисел — «мест» (заголовок колонки источника:
 * «Мошность (кол-во мест)»). Решение зафиксировано в docs/DECISIONS.md.
 */
export interface CapacityUnitRef {
  code: string;
  name: string;
  /** Варианты написания в источнике (для нормализации ETL), нижний регистр. */
  aliases: string[];
  sortOrder: number;
}

export const CAPACITY_UNITS: CapacityUnitRef[] = [
  { code: 'places', name: 'мест', aliases: ['мест', 'место', 'места', 'месте'], sortOrder: 1 },
  {
    code: 'bed_places',
    name: 'койко-мест',
    aliases: ['койко мест', 'койко-мест', 'коек', 'койка', 'койки'],
    sortOrder: 2,
  },
  {
    code: 'visits_per_shift',
    name: 'посещений в смену',
    aliases: ['посещений в смену', 'посещений', 'посещения в смену', 'посещение'],
    sortOrder: 3,
  },
  { code: 'apartments', name: 'квартир', aliases: ['квартир', 'квартира', 'квартиры'], sortOrder: 4 },
  { code: 'houses', name: 'домов', aliases: ['домов', 'дом', 'дома'], sortOrder: 5 },
  { code: 'm3_per_day', name: 'м³/сут', aliases: ['м3/сут', 'м3/сутки', 'м³/сут', 'м³/сутки'], sortOrder: 6 },
  {
    code: 'm3_per_hour',
    name: 'м³/ч',
    aliases: ['м3/ч', 'м3 / ч', 'м³/ч', 'кубический метр в час', 'кубических метров в час'],
    sortOrder: 7,
  },
  { code: 'kw', name: 'кВт', aliases: ['квт'], sortOrder: 8 },
  { code: 'mw', name: 'МВт', aliases: ['мвт'], sortOrder: 9 },
  { code: 'gcal_per_hour', name: 'Гкал/ч', aliases: ['гкал/час', 'гкал/ч'], sortOrder: 10 },
  { code: 'km', name: 'км', aliases: ['км', 'километр', 'километра'], sortOrder: 11 },
  { code: 'm2', name: 'м²', aliases: ['м2', 'м²'], sortOrder: 12 },
  { code: 'objects', name: 'объектов', aliases: ['объектов', 'объект', 'объекта'], sortOrder: 13 },
  { code: 'persons', name: 'человек', aliases: ['человек', 'человека', 'чел'], sortOrder: 14 },
];

export function getCapacityUnitByCode(code: string | null | undefined): CapacityUnitRef | null {
  if (!code) return null;
  return CAPACITY_UNITS.find((u) => u.code === code) ?? null;
}
