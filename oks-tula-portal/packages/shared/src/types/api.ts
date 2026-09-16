/**
 * Контракты REST API `/api/v1` (§11 ТЗ).
 * Единый формат ошибок и пагинации.
 */

import type {
  CapacityPart,
  ContractorContractRef,
  DateRange,
  ExpertiseRecord,
  GeocodeConfidence,
  GeocodeSource,
  HistoryOfPlace,
  LoadClass,
  MunicipalitySource,
  Ownership,
  SphereCode,
  StatusGroupCode,
  TimelineEvent,
} from './domain';

/** Единый формат ответа с пагинацией. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** Единый формат ошибки. */
export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Точка [lon, lat] (GeoJSON-порядок). */
export type LngLat = [number, number];

/** Краткая карточка объекта для списка/карты. */
export interface ObjectSummary {
  id: string;
  extId: string | null;
  name: string;
  industryCode: string | null;
  industryName: string | null;
  statusCode: string | null;
  statusName: string | null;
  statusGroup: StatusGroupCode | null;
  ownership: Ownership;
  municipalityId: string | null;
  municipalityName: string | null;
  addressNormalized: string | null;
  /** Точная координата (null — если геометрии нет). */
  point: LngLat | null;
  /** Точка для отображения: точная либо центроид МО («местоположение уточняется»). */
  displayPoint: LngLat | null;
  /** true — показывается приблизительное положение (центроид МО). */
  locationApproximate: boolean;
  geocodeSource: GeocodeSource | null;
  geocodeConfidence: GeocodeConfidence | null;
  readinessPct: number | null;
  areaM2: number | null;
  capacityValue: number | null;
  capacityUnitCode: string | null;
  yearStart: number | null;
  yearEnd: number | null;
  commissioningYear: number | null;
  riskFlags: string[];
  hasMedia: boolean;
  hasCamera: boolean;
}

/** Полная карточка объекта (Ф2). */
export interface ObjectDetails extends ObjectSummary {
  grbs: { id: string; name: string } | null;
  customer: { id: string; name: string } | null;
  contractor: { id: string; name: string } | null;
  contractorContractRefs: ContractorContractRef[];
  addressRaw: string | null;
  constructionStage: string | null;
  capacityParts: CapacityPart[];
  capacityRaw: string | null;
  expertise: ExpertiseRecord[];
  constructionPeriod: string | null;
  contractPeriod: DateRange | null;
  landTransferDate: string | null;
  permitDate: string | null;
  contractDate: string | null;
  equipmentDate: string | null;
  hydraulicTestDate: string | null;
  zosDate: string | null;
  zosNumber: string | null;
  actDate: string | null;
  actNumber: string | null;
  photoDate: string | null;
  projectCode: string | null;
  programNp: string | null;
  programFp: string | null;
  municipalitySource: MunicipalitySource | null;
  municipalityConflict: boolean;
  timeline: TimelineEvent[];
  historyOfPlace: HistoryOfPlace | null;
  /** Исходная запись реестра (блок «Прозрачность», Ф2 п.11). */
  raw: Record<string, string> | null;
  sourceRowNumber: number;
  importedAt: string | null;
  updatedAt: string | null;
}

/** Фильтры списка объектов (query-параметры GET /objects). */
export interface ObjectsFilters {
  industry?: string[]; // коды отраслей
  status?: string[]; // коды статусов
  statusGroup?: StatusGroupCode[];
  municipality?: string[]; // id МО
  ownership?: Ownership[];
  grbs?: string[]; // id организаций
  customer?: string[];
  contractor?: string[];
  yearFrom?: number; // год ввода/окончания
  yearTo?: number;
  readinessMin?: number;
  readinessMax?: number;
  q?: string; // поиск по названию/адресу/подрядчику
  bbox?: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  /** «Рядом со мной»: «lon,lat,radiusMeters» (геолокация с согласия пользователя). */
  near?: string;
  hasGeometry?: boolean;
  /** Только объекты с медиа (строка 'true'/'false' — для query-параметров). */
  hasMedia?: string;
  /** Только объекты с камерами. */
  hasCamera?: string;
  page?: number;
  limit?: number;
  sort?: 'name' | 'commissioningYear' | 'readiness' | 'yearEnd';
}

/** Сводка для главной страницы и дашборда (Ф9). */
export interface AnalyticsSummary {
  totalObjects: number;
  byStatusGroup: Record<StatusGroupCode, number>;
  byStatus: { code: string; name: string; group: StatusGroupCode; count: number }[];
  byIndustry: { code: string; name: string; count: number }[];
  byMunicipality: { id: string; name: string; count: number }[];
  commissioningByYear: { year: number; count: number }[];
  activeCount: number;
  completedCount: number;
  totalAreaM2: number | null;
  avgReadinessActive: number | null;
  /** Объектов без точного местоположения (§6.3 п.7 — обязателен счётчик в UI). */
  withoutExactLocationCount: number;
  municipalitiesCovered: number;
  dataActualDate: string | null;
  isMockParts: string[]; // какие части сводки основаны на демо-данных
}

/** «Объекты риска» (Ф9): истёк срок контракта при готовности < 100 и т. п. */
export interface RiskObject {
  id: string;
  name: string;
  municipalityName: string | null;
  readinessPct: number | null;
  contractEndDate: string | null;
  riskFlags: string[];
}

/** Строка «светофора» соцнагрузки по МО × сфера (Ф5). */
export interface SocialProvisionRow {
  municipalityId: string;
  municipalityName: string;
  sphere: SphereCode | 'composite';
  actualCapacity: number | null;
  normativePer1000: number | null;
  population: number | null;
  provisionIndex: number | null;
  loadClass: LoadClass;
  objectsCount: number;
  source: string;
  calculatedAt: string;
  isMock: boolean;
}

/** Строка индекса удовлетворённости (Ф7). */
export interface SatisfactionRow {
  municipalityId: string;
  municipalityName: string;
  industryCode: string | null;
  periodStart: string;
  periodEnd: string;
  appealsTotal: number;
  satisfactionIndex: number | null;
  avgResponseDays: number | null;
  isMock: boolean;
}

/** Элемент справочника. */
export interface DictionaryItem {
  id: string;
  name: string;
  [key: string]: unknown;
}

/** Ответ категории справочников. */
export type DictionaryKind =
  | 'industry'
  | 'status'
  | 'municipality'
  | 'appeal-category'
  | 'program'
  | 'organization'
  | 'capacity-unit';

/** Публичная карточка обращения/жалобы (обезличенная, Ф8). */
export interface AppealPublic {
  publicId: string;
  categoryCode: string;
  categoryTitle: string;
  status: 'new' | 'in_review' | 'accepted' | 'rejected' | 'resolved' | 'forwarded';
  objectId: string | null;
  objectName: string | null;
  municipalityName: string | null;
  createdAt: string;
  resolvedAt: string | null;
  descriptionAnonymized: string | null;
  isMock: boolean;
}

/** Результат прогона ETL / отчёт о качестве данных (§5, §6.1). */
export interface DataQualityReportMeta {
  generatedAt: string;
  sourceFile: string;
  sourceFileHash: string;
  totalRows: number;
  importedRows: number;
}
