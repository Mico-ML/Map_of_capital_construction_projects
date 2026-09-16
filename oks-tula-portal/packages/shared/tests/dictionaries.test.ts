import { describe, expect, it } from 'vitest';
import {
  APPEAL_CATEGORIES,
  CAPACITY_UNITS,
  INDUSTRIES,
  INDUSTRY_RAW_TO_CODE,
  LOAD_CLASS_STYLES,
  MUNICIPALITIES,
  MUNICIPALITY_CSV_ALIASES,
  SPHERES,
  STATUSES,
  STATUS_GROUPS,
  classifyProvision,
  getMunicipalityById,
  groupCoincidentPoints,
  spreadCoincidentPoint,
} from '../src';

describe('Справочник статусов', () => {
  it('6 статусов из реестра, у всех есть группа и цвет', () => {
    expect(STATUSES).toHaveLength(6);
    for (const s of STATUSES) {
      expect(STATUS_GROUPS[s.group]).toBeDefined();
      expect(s.colorHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
  it('группы: design/construction/procurement/completed', () => {
    const groups = new Set(STATUSES.map((s) => s.group));
    expect(groups).toEqual(new Set(['design', 'construction', 'procurement', 'completed']));
  });
});

describe('Справочник отраслей', () => {
  it('11 отраслей, 5 сфер Ф5', () => {
    expect(INDUSTRIES).toHaveLength(11);
    expect(SPHERES).toHaveLength(5);
  });
  it('все сырые значения из CSV маппятся на коды', () => {
    // 10 осмысленных значений отрасли из реестра (без «0»)
    const rawValues = Object.keys(INDUSTRY_RAW_TO_CODE);
    expect(rawValues.length).toBeGreaterThanOrEqual(10);
    for (const raw of rawValues) {
      expect(INDUSTRIES.some((i) => i.code === INDUSTRY_RAW_TO_CODE[raw])).toBe(true);
    }
  });
});

describe('Справочник МО', () => {
  it('26 МО Тульской области, уникальные id и ОКТМО', () => {
    expect(MUNICIPALITIES).toHaveLength(26);
    expect(new Set(MUNICIPALITIES.map((m) => m.id)).size).toBe(26);
    expect(new Set(MUNICIPALITIES.map((m) => m.oktmo)).size).toBe(26);
  });
  it('центроиды внутри области (lon 36–39, lat 53–55)', () => {
    for (const m of MUNICIPALITIES) {
      expect(m.center[0]).toBeGreaterThan(36);
      expect(m.center[0]).toBeLessThan(39);
      expect(m.center[1]).toBeGreaterThan(53);
      expect(m.center[1]).toBeLessThan(55);
      expect(m.areaKm2).toBeGreaterThan(5);
    }
  });
  it('все варианты написания «АМО» из CSV ведут на существующие МО', () => {
    // 24 варианта из колонки «АМО» + «АМО город Тула» из колонки «Заказчик» (страховка нормализации)
    expect(Object.keys(MUNICIPALITY_CSV_ALIASES).length).toBeGreaterThanOrEqual(24);
    for (const id of Object.values(MUNICIPALITY_CSV_ALIASES)) {
      expect(getMunicipalityById(id)).not.toBeNull();
    }
  });
  it('20 уникальных МО после нормализации падежей', () => {
    expect(new Set(Object.values(MUNICIPALITY_CSV_ALIASES)).size).toBe(20);
  });
});

describe('Палитра «светофора» (§8)', () => {
  it('5 классов с HEX из ТЗ', () => {
    expect(LOAD_CLASS_STYLES.deficit.colorHex).toBe('#D32F2F');
    expect(LOAD_CLASS_STYLES.border.colorHex).toBe('#F9A825');
    expect(LOAD_CLASS_STYLES.normal.colorHex).toBe('#7CB342');
    expect(LOAD_CLASS_STYLES.surplus.colorHex).toBe('#2E7D32');
    expect(LOAD_CLASS_STYLES.no_data.colorHex).toBe('#BDBDBD');
  });
  it('классификация provision_index по порогам Ф5', () => {
    expect(classifyProvision(null)).toBe('no_data');
    expect(classifyProvision(0.69)).toBe('deficit');
    expect(classifyProvision(0.7)).toBe('border');
    expect(classifyProvision(0.99)).toBe('border');
    expect(classifyProvision(1.0)).toBe('normal');
    expect(classifyProvision(1.49)).toBe('normal');
    expect(classifyProvision(1.5)).toBe('surplus');
    expect(classifyProvision(3)).toBe('surplus');
  });
});

describe('Категории жалоб (Ф8)', () => {
  it('9 категорий строго из ТЗ, «иное» требует комментарий', () => {
    expect(APPEAL_CATEGORIES.length).toBeGreaterThanOrEqual(9);
    const other = APPEAL_CATEGORIES.find((c) => c.code === 'other');
    expect(other?.requiresComment).toBe(true);
    for (const c of APPEAL_CATEGORIES) expect(c.slaDays).toBeGreaterThan(0);
  });
});

describe('Единицы мощности', () => {
  it('справочник покрывает единицы из Приложения B + Гкал/ч из данных', () => {
    const codes = CAPACITY_UNITS.map((u) => u.code);
    for (const c of ['places', 'bed_places', 'visits_per_shift', 'apartments', 'houses', 'm3_per_day', 'm3_per_hour', 'kw', 'mw', 'km', 'm2', 'objects', 'persons', 'gcal_per_hour']) {
      expect(codes).toContain(c);
    }
  });
});

describe('Разноска совпадающих координат (§5: 2 пары дублей)', () => {
  it('группирует дубли и детерминированно разводит', () => {
    const items = [
      { id: 'b', point: [37.52713, 54.197689] as [number, number] },
      { id: 'a', point: [37.52713, 54.197689] as [number, number] },
      { id: 'c', point: [37.6, 54.2] as [number, number] },
      { id: 'd', point: null },
    ];
    const groups = groupCoincidentPoints(items);
    expect(groups.size).toBe(2);
    expect(groups.get('a')).toEqual({ index: 0, size: 2 });
    expect(groups.get('b')).toEqual({ index: 1, size: 2 });
    // детерминированность: одинаковый вход → одинаковый выход
    const s1 = spreadCoincidentPoint([37.52713, 54.197689], 0, 2);
    const s2 = spreadCoincidentPoint([37.52713, 54.197689], 0, 2);
    expect(s1).toEqual(s2);
    // разные индексы → разные точки
    const s3 = spreadCoincidentPoint([37.52713, 54.197689], 1, 2);
    expect(s1).not.toEqual(s3);
  });
});
