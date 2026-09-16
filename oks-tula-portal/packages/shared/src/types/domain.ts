/**
 * Доменные типы портала ОКС Тульской области.
 * Общий контракт frontend/backend/ETL (§2 ТЗ: типизированные контракты API).
 */

/** Группы статусов строительства (Приложение B ТЗ). */
export type StatusGroupCode = 'design' | 'construction' | 'procurement' | 'completed';

/** Форма собственности. `unknown` — значение `0`/пусто в источнике. */
export type Ownership = 'state' | 'municipal' | 'unknown';

/** Источник координаты объекта (§6.3). */
export type GeocodeSource = 'csv' | 'geocoder' | 'manual' | 'inferred_from_name';

/** Уровень доверия геокодирования (§6.3). */
export type GeocodeConfidence = 'high' | 'medium' | 'low';

/** Источник определения принадлежности к МО. */
export type MunicipalitySource =
  | 'csv_column' // колонка «АМО» в реестре
  | 'geometry' // ST_Contains по геометрии объекта
  | 'inferred_address' // извлечено из текста адреса
  | 'inferred_name'; // извлечено из наименования ОКС

/** Сферы социальной инфраструктуры для «светофора» (Ф5). */
export type SphereCode = 'education' | 'health' | 'sport' | 'energy' | 'culture';

/** Классы нагрузки «светофора» (Ф5, палитра §8). */
export type LoadClass = 'deficit' | 'border' | 'normal' | 'surplus' | 'no_data';

/** Тип муниципального образования (по уставу/ОКТМО). */
export type MunicipalityType = 'urban_okrug' | 'municipal_district' | 'municipal_okrug' | 'zato';

/** Диапазон дат с сохранением исходной строки (§6.1 п.4). */
export interface DateRange {
  start: string | null; // ISO-дата YYYY-MM-DD
  end: string | null; // ISO-дата YYYY-MM-DD
  raw: string; // как в источнике
  note?: string; // пояснение нормализации (опечатка формата, только годы и т. п.)
}

/** Запись об экспертизе (§6.2, колонка 18 реестра). */
export interface ExpertiseRecord {
  date: string | null; // ISO-дата
  number: string | null;
  raw: string;
  note?: string; // например «нестандартная запись источника»
}

/** Часть составной мощности («400 посещений, 340 коек» → 2 части). */
export interface CapacityPart {
  value: number | null;
  unitCode: string | null; // код из справочника capacityUnits
  unitRaw: string; // единица как в источнике
}

/** Элемент таймлайна объекта (Ф2, блок 10). */
export interface TimelineEvent {
  date: string | null; // ISO-дата
  title: string;
  description?: string | null;
  type:
    | 'land_transfer'
    | 'permit'
    | 'contract'
    | 'construction_start'
    | 'equipment'
    | 'hydraulic_test'
    | 'zos'
    | 'act'
    | 'commissioning'
    | 'planned'
    | 'custom';
  isPlanned?: boolean;
}

/** История места (Ф2, блок 8; на MVP заполняется в админке/моках). */
export interface HistoryOfPlace {
  previousUse: string | null;
  description: string | null;
  sinceYear: number | null;
  source: string | null;
  isMock: boolean;
}

/** Организация (ГРБС / заказчик / подрядчик). */
export interface OrganizationRef {
  id: string;
  type: 'customer' | 'contractor' | 'grbs';
  nameNormalized: string;
  nameRaw: string;
  inn: string | null;
  aliases: string[];
}

/** Ссылка на контрактные реквизиты, «зашитые» в ячейку «Подрядчик». */
export interface ContractorContractRef {
  number: string | null;
  date: string | null;
  raw: string;
}
