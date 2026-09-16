import type {
  AccessibilityReport,
  AnalyticsSummary,
  ApiErrorEnvelope,
  CoverageResult,
  DictionaryItem,
  IsochroneBatchResult,
  IsochroneResult,
  IsochroneStatus,
  ObjectDetails,
  ObjectSummary,
  ObjectsFilters,
  Paginated,
  RiskObject,
} from '@oks/shared';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1';

/** Ошибка API с единым конвертом `{ error: { code, message } }`. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Сериализация параметров: массивы — повтором ключа, пустые — пропускаются. */
export function buildQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const v of value) if (v !== undefined && v !== null && v !== '') search.append(key, String(v));
    } else {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let code = 'ERROR';
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as ApiErrorEnvelope;
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      /* тело не JSON — оставляем message по умолчанию */
    }
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as T;
}

export const api = {
  objects: (filters: ObjectsFilters = {}): Promise<Paginated<ObjectSummary>> =>
    request<Paginated<ObjectSummary>>(`/objects${buildQuery(filters as Record<string, unknown>)}`),
  object: (id: string): Promise<ObjectDetails> => request<ObjectDetails>(`/objects/${id}`),
  objectGeoJson: (id: string): Promise<unknown> => request<unknown>(`/objects/${id}/geojson`),
  objectContracts: (id: string): Promise<ObjectContract[]> => request<ObjectContract[]>(`/objects/${id}/contracts`),
  objectAppeals: (id: string): Promise<ObjectAppeal[]> => request<ObjectAppeal[]>(`/objects/${id}/appeals`),
  objectMedia: (id: string): Promise<ObjectMedia[]> => request<ObjectMedia[]>(`/objects/${id}/media`),
  objectCameras: (id: string): Promise<ObjectCamera[]> => request<ObjectCamera[]>(`/objects/${id}/cameras`),
  imageryStatus: (): Promise<ImageryStatus> => request<ImageryStatus>('/imagery/status'),
  // --- Ф4: зоны пешей доступности и отчёт доступности (через бэкенд-прокси, §4.5) ---
  objectIsochrone: (id: string, params: IsochroneParams): Promise<IsochroneResult> =>
    request<IsochroneResult>(`/objects/${id}/isochrone${buildQuery(params as Record<string, unknown>)}`),
  accessibilityReport: (id: string, params: AccessibilityParams): Promise<AccessibilityReport> =>
    request<AccessibilityReport>(`/objects/${id}/accessibility-report${buildQuery(params as Record<string, unknown>)}`),
  isochroneStatus: (): Promise<IsochroneStatus> => request<IsochroneStatus>('/isochrone/status'),
  isochroneCoverage: (params: CoverageParams): Promise<CoverageResult> =>
    request<CoverageResult>(`/isochrone/coverage${buildQuery(params as Record<string, unknown>)}`),
  isochroneBatch: (body: BatchParams): Promise<IsochroneBatchResult> =>
    request<IsochroneBatchResult>('/isochrone/batch', { method: 'POST', body: JSON.stringify(body) }),
  rubrics: (q: string): Promise<unknown> => request<unknown>(`/geo/rubrics${buildQuery({ q })}`),
  analyticsSummary: (): Promise<AnalyticsSummary> => request<AnalyticsSummary>('/analytics/summary'),
  analyticsRisks: (): Promise<RiskObject[]> => request<RiskObject[]>('/analytics/risks'),
  dictionary: (kind: string): Promise<{ items: DictionaryItem[] }> =>
    request<{ items: DictionaryItem[] }>(`/dictionaries/${kind}`),
  municipalitiesGeoJson: (): Promise<unknown> => request<unknown>('/municipalities/geojson'),
  dataQuality: (): Promise<unknown> => request<unknown>('/data-quality'),
  geocode: (q: string): Promise<unknown> => request<unknown>(`/geo/geocode${buildQuery({ q })}`),
  health: (): Promise<unknown> => fetch('/api/health').then((r) => r.json()) as Promise<unknown>,
  /** URL экспорта текущей выборки (для ссылок скачивания CSV/XLSX/GeoJSON). */
  exportUrl: (format: 'csv' | 'xlsx' | 'geojson', filters: ObjectsFilters = {}): string =>
    `${API_BASE}/export${buildQuery({ ...filters, format } as Record<string, unknown>)}`,
};

/** Контракт/закупка объекта (Ф6; на MVP — демо-данные). */
export interface ObjectContract {
  id: number;
  number: string | null;
  date: string | null;
  price: number | null;
  stage: string | null;
  status: string | null;
  customer: string | null;
  contractor: string | null;
  executionStart: string | null;
  executionEnd: string | null;
  source: string;
  url: string | null;
  isMock: boolean;
}

/** Публичное (обезличенное) обращение по объекту (Ф8). */
export interface ObjectAppeal {
  publicId: string;
  categoryCode: string;
  categoryTitle: string;
  status: string;
  createdAt: string;
  descriptionAnonymized: string | null;
  isMock: boolean;
}

/** Медиа-ассет объекта (Ф3). */
export interface ObjectMedia {
  id: number;
  kind: string;
  url: string;
  takenAt: string | null;
  year: number | null;
  caption: string | null;
  license?: string | null;
  bounds?: { west: number; south: number; east: number; north: number } | null;
  isMock: boolean;
}

/** Камера стройплощадки (Ф3). */
export interface ObjectCamera {
  id: number;
  title: string;
  type: 'hls' | 'rtsp' | 'snapshot';
  url: string;
  refreshSec: number;
  isActive: boolean;
  isMock: boolean;
}

/** Статус интеграций архивных снимков и камер. */
export interface ImageryStatus {
  imagery: { provider: string; availableYears: number[]; attribution: string | null; note: string };
  camera: { provider: string; note: string };
}

/** Параметры запроса зон доступности (§11: `?duration=600,900&reverse=false&transport=walking`). */
export interface IsochroneParams {
  duration?: string;
  reverse?: string;
  transport?: string;
  allowApproximate?: string;
}

/** Параметры отчёта доступности. */
export interface AccessibilityParams extends IsochroneParams {
  allSpheres?: string;
  refreshPoi?: string;
}

/** Параметры сводного покрытия и «белых пятен» (пакетный режим Ф4). */
export interface CoverageParams {
  sphere?: string;
  industry?: string;
  municipality?: string;
  statusGroup?: string;
  duration?: number;
  reverse?: string;
  allowApproximate?: string;
}

/** Тело пакетного построения изохрон. */
export interface BatchParams extends CoverageParams {
  durations?: string;
  force?: string;
}
