import { create } from 'zustand';
import { DEFAULT_DURATIONS_SEC, type ObjectsFilters, type StatusGroupCode } from '@oks/shared';

/**
 * UI-состояние (Zustand). Серверные данные здесь НЕ храним — они в TanStack Query (§3).
 * Храним только фильтры, выбор, состояние панелей и режим просмотра.
 */
interface UiState {
  filters: ObjectsFilters;
  selectedObjectId: string | null;
  hoveredObjectId: string | null;
  filterPanelOpen: boolean;
  viewMode: 'map' | 'table';
  compareIds: string[];
  /** Состояние слоя зон пешей доступности (Ф4): настройки общие для карты и карточки. */
  isoDurations: number[];
  isoReverse: boolean;
  isoApproximate: boolean;
  isoVisible: boolean;
  setFilters: (patch: Partial<ObjectsFilters>) => void;
  replaceFilters: (filters: ObjectsFilters) => void;
  resetFilters: () => void;
  selectObject: (id: string | null) => void;
  hoverObject: (id: string | null) => void;
  toggleFilterPanel: () => void;
  setViewMode: (mode: 'map' | 'table') => void;
  toggleCompare: (id: string) => void;
  clearCompare: () => void;
  toggleIsoDuration: (durationSec: number) => void;
  setIsoDurations: (durations: number[]) => void;
  setIsoReverse: (reverse: boolean) => void;
  setIsoApproximate: (allow: boolean) => void;
  setIsoVisible: (visible: boolean) => void;
}

export const initialFilters: ObjectsFilters = { page: 1, limit: 100, sort: 'name' };

export const useUiStore = create<UiState>((set) => ({
  filters: initialFilters,
  selectedObjectId: null,
  hoveredObjectId: null,
  filterPanelOpen: true,
  viewMode: 'map',
  compareIds: [],
  isoDurations: [...DEFAULT_DURATIONS_SEC],
  isoReverse: false,
  isoApproximate: false,
  isoVisible: true,
  setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch, page: 1 } })),
  replaceFilters: (filters) => set({ filters }),
  resetFilters: () => set({ filters: initialFilters }),
  selectObject: (id) => set({ selectedObjectId: id }),
  hoverObject: (id) => set({ hoveredObjectId: id }),
  toggleFilterPanel: () => set((s) => ({ filterPanelOpen: !s.filterPanelOpen })),
  setViewMode: (mode) => set({ viewMode: mode }),
  toggleCompare: (id) =>
    set((s) => {
      const has = s.compareIds.includes(id);
      if (has) return { compareIds: s.compareIds.filter((x) => x !== id) };
      if (s.compareIds.length >= 3) return { compareIds: [...s.compareIds.slice(1), id] };
      return { compareIds: [...s.compareIds, id] };
    }),
  clearCompare: () => set({ compareIds: [] }),
  // §4.2: не более 5 промежутков времени; переключение последнего активного значения
  // скрывает слой, но оставляет настройки (повторный клик возвращает зону).
  toggleIsoDuration: (durationSec) =>
    set((s) => {
      const has = s.isoDurations.includes(durationSec);
      const next = has ? s.isoDurations.filter((d) => d !== durationSec) : [...s.isoDurations, durationSec].sort((a, b) => a - b);
      return { isoDurations: next.slice(0, 5), isoVisible: next.length > 0 ? s.isoVisible : false };
    }),
  setIsoDurations: (durations) => set({ isoDurations: [...durations].sort((a, b) => a - b).slice(0, 5) }),
  setIsoReverse: (reverse) => set({ isoReverse: reverse }),
  setIsoApproximate: (allow) => set({ isoApproximate: allow }),
  setIsoVisible: (visible) => set({ isoVisible: visible }),
}));

/** Список групп статусов для фильтров (порядок для UI). */
export const STATUS_GROUP_ORDER: StatusGroupCode[] = ['design', 'construction', 'procurement', 'completed'];
