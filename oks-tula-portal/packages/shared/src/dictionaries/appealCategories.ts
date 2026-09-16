/**
 * Категории обращений/жалоб на состояние строительных объектов — строго по §7 Ф8 ТЗ.
 * Справочник расширяемый; SLA — в сутках, значения согласуются заказчиком.
 */
export interface AppealCategoryRef {
  code: string;
  title: string;
  description: string;
  slaDays: number;
  /** Категория требует обязательного комментария («иное»). */
  requiresComment: boolean;
}

export const APPEAL_CATEGORIES: AppealCategoryRef[] = [
  {
    code: 'construction_debris',
    title: 'Строительный мусор',
    description: 'Мусор, остатки материалов, порубочные остатки вне ограждённой зоны',
    slaDays: 10,
    requiresComment: false,
  },
  {
    code: 'damaged_road',
    title: 'Разбитая/повреждённая дорога',
    description: 'Повреждения покрытия проезжей части, тротуаров, обочин строительной техникой',
    slaDays: 15,
    requiresComment: false,
  },
  {
    code: 'mud_at_exit',
    title: 'Грязь на выезде со стройплощадки',
    description: 'Вынос грязи колёсами техники, отсутствие пункта мойки колёс',
    slaDays: 7,
    requiresComment: false,
  },
  {
    code: 'noise_schedule',
    title: 'Нарушение графика шумных работ',
    description: 'Шумные работы в ночное время и часы тишины, нарушение утверждённого графика',
    slaDays: 7,
    requiresComment: false,
  },
  {
    code: 'uncovered_vehicle',
    title: 'Техника без тента при перевозке сыпучих материалов',
    description: 'Перевозка грунта, песка, щебня без укрытия кузова, просыпание на дорогу',
    slaDays: 7,
    requiresComment: false,
  },
  {
    code: 'no_info_board',
    title: 'Отсутствие информационного стенда (паспорта объекта)',
    description: 'На строительной площадке отсутствует стенд с паспортом объекта',
    slaDays: 10,
    requiresComment: false,
  },
  {
    code: 'fencing_safety',
    title: 'Ограждение/зона безопасности',
    description: 'Отсутствие или повреждение ограждения, открытые котлованы, опасные зоны',
    slaDays: 5,
    requiresComment: false,
  },
  {
    code: 'dust_emissions',
    title: 'Пыль и выбросы',
    description: 'Пыление при земляных работах, выбросы, отсутствие пылеподавления',
    slaDays: 10,
    requiresComment: false,
  },
  {
    code: 'other',
    title: 'Иное',
    description: 'Другая проблема, связанная со строительством объекта (обязателен комментарий)',
    slaDays: 15,
    requiresComment: true,
  },
];

export function getAppealCategory(code: string): AppealCategoryRef | null {
  return APPEAL_CATEGORIES.find((c) => c.code === code) ?? null;
}
