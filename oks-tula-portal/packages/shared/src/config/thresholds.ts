import type { LoadClass, SphereCode } from '../types/domain';

/**
 * Пороги и веса «светофора» соцнагрузки (Ф5) и методики удовлетворённости (Ф7).
 * Все значения КОНФИГУРИРУЕМЫ и требуют утверждения заказчиком (§7 Ф5, §15 п.3).
 */

/** Пороги классов обеспеченности по provision_index (§7 Ф5). */
export const LOAD_CLASS_THRESHOLDS = {
  /** < 0.7 — дефицит (красный). */
  deficitBelow: 0.7,
  /** 0.7–1.0 — пограничное (жёлтый). */
  borderBelow: 1.0,
  /** 1.0–1.5 — норма (светло-зелёный). */
  normalBelow: 1.5,
  /** > 1.5 — повышенная обеспеченность (тёмно-зелёный). */
} as const;

/** Классификация provision_index → класс нагрузки. */
export function classifyProvision(index: number | null | undefined): LoadClass {
  if (index === null || index === undefined || Number.isNaN(index)) return 'no_data';
  if (index < LOAD_CLASS_THRESHOLDS.deficitBelow) return 'deficit';
  if (index < LOAD_CLASS_THRESHOLDS.borderBelow) return 'border';
  if (index < LOAD_CLASS_THRESHOLDS.normalBelow) return 'normal';
  return 'surplus';
}

/**
 * Веса сфер композитного индекса (средневзвешенное).
 * Требуют утверждения заказчиком; по умолчанию — равные веса.
 */
export const SPHERE_WEIGHTS: Record<SphereCode, number> = {
  education: 0.2,
  health: 0.2,
  sport: 0.2,
  energy: 0.2,
  culture: 0.2,
};

/**
 * Нормативы градостроительного проектирования (СП 42.13330.2016 и региональные
 * нормативы). ЗНАЧЕНИЯ ТРЕБУЮТ УТВЕРЖДЕНИЯ ЗАКАЗЧИКОМ.
 * value_per_1000 — на 1000 жителей.
 */
export interface NormativeRef {
  sphere: SphereCode;
  name: string;
  valuePer1000: number;
  unit: string;
  source: string;
  approvedByCustomer: boolean;
}

export const NORMATIVES: NormativeRef[] = [
  {
    sphere: 'education',
    name: 'Дошкольные образовательные организации',
    valuePer1000: 61,
    unit: 'мест',
    source: 'СП 42.13330.2016 (пример из ТЗ)',
    approvedByCustomer: false,
  },
  {
    sphere: 'education',
    name: 'Общеобразовательные организации',
    valuePer1000: 113,
    unit: 'мест',
    source: 'СП 42.13330.2016 (пример из ТЗ)',
    approvedByCustomer: false,
  },
  {
    sphere: 'health',
    name: 'Амбулаторно-поликлинические учреждения',
    valuePer1000: 28.2,
    unit: 'посещений в смену',
    source: 'СП 42.13330.2016 — ТРЕБУЕТ УТОЧНЕНИЯ ЗАКАЗЧИКОМ',
    approvedByCustomer: false,
  },
  {
    sphere: 'sport',
    name: 'Спортивные сооружения',
    valuePer1000: 17,
    unit: 'мест единовременных занятий',
    source: 'СП 42.13330.2016 — ТРЕБУЕТ УТОЧНЕНИЯ ЗАКАЗЧИКОМ',
    approvedByCustomer: false,
  },
  {
    sphere: 'culture',
    name: 'Культурно-досуговые учреждения',
    valuePer1000: 15,
    unit: 'мест',
    source: 'СП 42.13330.2016 — ТРЕБУЕТ УТОЧНЕНИЯ ЗАКАЗЧИКОМ',
    approvedByCustomer: false,
  },
  {
    sphere: 'energy',
    name: 'Мощности тепло-/водоснабжения',
    valuePer1000: 0,
    unit: 'н/д',
    source: 'Методика для энергетики согласуется отдельно — ТРЕБУЕТ УТВЕРЖДЕНИЯ',
    approvedByCustomer: false,
  },
];

/**
 * Параметры расчёта индекса удовлетворённости (Ф7).
 * Формула — в services/satisfaction.ts (бэкенд), покрыта unit-тестами.
 * Веса требуют утверждения заказчиком.
 */
export const SATISFACTION_WEIGHTS = {
  resolvedShare: 0.4,
  responseTimeScore: 0.25,
  overduePenalty: 0.2,
  repeatPenalty: 0.15,
  /** Медианное время ответа, при котором score = 1 (дней). */
  targetResponseDays: 10,
  /** Время ответа, при котором score = 0 (дней). */
  maxAcceptableResponseDays: 30,
} as const;

/** Вес строящихся объектов как «перспективной мощности» (Ф5): готовность × поправка года ввода. */
export const PLANNED_CAPACITY_WEIGHTS = {
  /** Учитывать строящиеся объекты в обеспеченности (переключатель в UI). */
  includePlannedDefault: true,
  /** Минимальная готовность, с которой объект учитывается в перспективной мощности. */
  minReadinessPct: 5,
} as const;
