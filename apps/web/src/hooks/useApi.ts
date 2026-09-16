import { useQuery } from '@tanstack/react-query';
import type {
  AccessibilityReport,
  AnalyticsSummary,
  CoverageResult,
  DictionaryItem,
  IsochroneResult,
  IsochroneStatus,
  ObjectDetails,
  ObjectSummary,
  ObjectsFilters,
  Paginated,
  RiskObject,
} from '@oks/shared';
import { api } from '../lib/api-client';

/** Серверное состояние — TanStack Query (кэш, ретраи, дедупликация). */

export function useAnalyticsSummary() {
  return useQuery<AnalyticsSummary>({
    queryKey: ['analytics', 'summary'],
    queryFn: api.analyticsSummary,
    staleTime: 60_000,
  });
}

export function useAnalyticsRisks() {
  return useQuery<RiskObject[]>({ queryKey: ['analytics', 'risks'], queryFn: api.analyticsRisks, staleTime: 60_000 });
}

export function useObjects(filters: ObjectsFilters) {
  return useQuery<Paginated<ObjectSummary>>({
    queryKey: ['objects', filters],
    queryFn: () => api.objects(filters),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

export function useObject(id: string | null) {
  return useQuery<ObjectDetails>({
    queryKey: ['object', id],
    queryFn: () => api.object(id as string),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}

export function useDictionary(kind: string) {
  return useQuery<DictionaryItem[]>({
    queryKey: ['dictionary', kind],
    queryFn: async () => (await api.dictionary(kind)).items,
    staleTime: 5 * 60_000,
  });
}

export function useObjectContracts(id: string | null) {
  return useQuery({
    queryKey: ['object', id, 'contracts'],
    queryFn: () => api.objectContracts(id as string),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}

export function useObjectAppeals(id: string | null) {
  return useQuery({
    queryKey: ['object', id, 'appeals'],
    queryFn: () => api.objectAppeals(id as string),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}

export function useObjectMedia(id: string | null) {
  return useQuery({
    queryKey: ['object', id, 'media'],
    queryFn: () => api.objectMedia(id as string),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}

export function useObjectCameras(id: string | null) {
  return useQuery({
    queryKey: ['object', id, 'cameras'],
    queryFn: () => api.objectCameras(id as string),
    enabled: Boolean(id),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useImageryStatus() {
  return useQuery({
    queryKey: ['imagery', 'status'],
    queryFn: api.imageryStatus,
    staleTime: 5 * 60_000,
  });
}

export function useMunicipalitiesGeoJson() {
  return useQuery({
    queryKey: ['municipalities', 'geojson'],
    queryFn: api.municipalitiesGeoJson,
    staleTime: 10 * 60_000,
  });
}

// ---------------------------------------------------------------------------
// Ф4: зоны пешей доступности и отчёт доступности
// ---------------------------------------------------------------------------

export interface IsochroneQuery {
  objectId: string | null;
  durations: number[];
  reverse: boolean;
  allowApproximate: boolean;
  /** false — зоны не запрашиваем (панель закрыта). */
  enabled?: boolean;
}

function isochroneParams(q: IsochroneQuery) {
  return {
    duration: q.durations.join(','),
    reverse: q.reverse ? 'true' : 'false',
    transport: 'walking',
    allowApproximate: q.allowApproximate ? 'true' : 'false',
  };
}

/**
 * Зоны доступности объекта. Один и тот же ключ запроса используют панель в
 * карточке и карта — TanStack Query дедуплицирует вызовы (запрос к API один).
 */
export function useObjectIsochrone(q: IsochroneQuery) {
  return useQuery<IsochroneResult>({
    queryKey: ['isochrone', q.objectId, q.durations, q.reverse, q.allowApproximate],
    queryFn: () => api.objectIsochrone(q.objectId as string, isochroneParams(q)),
    enabled: Boolean(q.objectId) && q.durations.length > 0 && q.enabled !== false,
    staleTime: 5 * 60_000,
    // расчёт без кэша может занять до 15 с (§9) — ретраи не дёргаем автоматически
    retry: 1,
  });
}

export function useAccessibilityReport(q: IsochroneQuery & { allSpheres?: boolean; refreshPoi?: boolean }) {
  return useQuery<AccessibilityReport>({
    queryKey: [
      'accessibility-report',
      q.objectId,
      q.durations,
      q.reverse,
      q.allowApproximate,
      Boolean(q.allSpheres),
      Boolean(q.refreshPoi),
    ],
    queryFn: () =>
      api.accessibilityReport(q.objectId as string, {
        ...isochroneParams(q),
        allSpheres: q.allSpheres ? 'true' : undefined,
        refreshPoi: q.refreshPoi ? 'true' : undefined,
      }),
    enabled: Boolean(q.objectId) && q.durations.length > 0 && q.enabled !== false,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useIsochroneStatus() {
  return useQuery<IsochroneStatus>({
    queryKey: ['isochrone', 'status'],
    queryFn: api.isochroneStatus,
    staleTime: 5 * 60_000,
  });
}

export interface CoverageQuery {
  sphere: string | null;
  industry: string[];
  municipality: string[];
  durationSec: number;
  reverse: boolean;
  allowApproximate: boolean;
  enabled?: boolean;
}

export function useCoverage(q: CoverageQuery) {
  return useQuery<CoverageResult>({
    queryKey: ['isochrone', 'coverage', q.sphere, q.industry, q.municipality, q.durationSec, q.reverse, q.allowApproximate],
    queryFn: () =>
      api.isochroneCoverage({
        sphere: q.sphere ?? undefined,
        industry: q.industry.length ? q.industry.join(',') : undefined,
        municipality: q.municipality.length ? q.municipality.join(',') : undefined,
        duration: q.durationSec,
        reverse: q.reverse ? 'true' : 'false',
        allowApproximate: q.allowApproximate ? 'true' : 'false',
      }),
    enabled: q.enabled !== false,
    staleTime: 60_000,
    retry: 1,
  });
}
