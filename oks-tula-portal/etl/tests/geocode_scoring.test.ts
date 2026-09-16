import { describe, expect, it } from 'vitest';
import { normalizePlaceName, scoreCandidate, selectBestCandidate } from '../src/geocode/scoring';
import { extractComponents } from '../src/geocode/provider';
import { extractExpectedFromAddress } from '../src/geocode/pipeline';
import type { GeocodeCandidate } from '../src/geocode/types';
import type { ExpectedLocation } from '../src/geocode/types';

function candidate(partial: Partial<GeocodeCandidate>): GeocodeCandidate {
  return {
    id: '1',
    fullName: 'test',
    point: { lat: 54.5, lon: 37.7 },
    addressName: null,
    admDiv: [],
    ...partial,
  };
}

const expectedYasnogorsk: ExpectedLocation = {
  municipalityId: 'yasnogorsky',
  municipalityNames: ['Ясногорский муниципальный район', 'Ясногорский', 'г. Ясногорск'],
  settlement: 'Ясногорск',
  street: 'улица Л.Толстого',
  house: '13',
};

describe('normalizePlaceName', () => {
  it('снимает родовые слова, регистр и ё', () => {
    expect(normalizePlaceName('Щёкинский район')).toBe('щекинский');
    expect(normalizePlaceName('городской округ Тула')).toBe('тула');
    expect(normalizePlaceName('г. Ясногорск')).toBe('ясногорск');
  });
});

describe('Скоринг кандидатов (§6.3 п.3)', () => {
  it('полное совпадение: район+НП+улица+дом → 9 (high)', () => {
    const c = candidate({
      admDiv: [
        { name: 'Ясногорский район', type: 'district' },
        { name: 'Тульская область', type: 'region' },
      ],
      components: { settlement: 'Ясногорск', street: 'улица Л. Толстого', house: '13' },
    });
    const s = scoreCandidate(c, expectedYasnogorsk);
    expect(s.score).toBe(9);
    expect(s.breakdown.districtMatch).toBe('match');
    expect(s.rejectReason).toBeUndefined();
    const sel = selectBestCandidate([s]);
    expect(sel.confidence).toBe('high');
  });

  it('другой район → −3 и rejected (подмена одноимённой улицы, §6.3)', () => {
    // кейс из измерений ТЗ: «г. Алексин, ул. Героев Алексинцев» → «Тула, Большая улица, 8»
    const c = candidate({
      admDiv: [
        { name: 'город Тула', type: 'urban_district' },
        { name: 'Тульская область', type: 'region' },
      ],
      components: { settlement: 'Тула', street: 'Большая улица', house: '8' },
    });
    const s = scoreCandidate(c, {
      municipalityId: 'aleksin',
      municipalityNames: ['городской округ Алексин', 'Алексин', 'г. Алексин'],
      settlement: 'Алексин',
      street: 'улица Героев Алексинцев',
      house: '8Б',
    });
    expect(s.breakdown.districtMatch).toBe('mismatch');
    expect(s.rejectReason).toBeDefined();
    expect(selectBestCandidate([s]).best).toBeNull();
  });

  it('отвергнутый по району не побеждает даже при большем score', () => {
    const rejected = scoreCandidate(
      candidate({
        admDiv: [{ name: 'город Тула', type: 'urban_district' }],
        components: { settlement: 'Ясногорск', street: 'улица Л. Толстого', house: '13' },
      }),
      expectedYasnogorsk,
    );
    const weak = scoreCandidate(
      candidate({
        admDiv: [{ name: 'Ясногорский район', type: 'district' }],
        components: { settlement: 'Ясногорск', street: null, house: null },
      }),
      expectedYasnogorsk,
    );
    const sel = selectBestCandidate([rejected, weak]);
    expect(sel.best).toBe(weak);
    // отклонённый кандидат не считается «вторым»: у единственного валидного
    // кандидата со score 6 преимущество есть → high
    expect(sel.confidence).toBe('high');
  });

  it('high требует преимущества перед вторым кандидатом', () => {
    const base = {
      admDiv: [{ name: 'Ясногорский район', type: 'district' }],
      components: { settlement: 'Ясногорск', street: 'улица Л. Толстого', house: '13' },
    };
    const a = scoreCandidate(candidate({ id: 'a', ...base }), expectedYasnogorsk);
    const b = scoreCandidate(candidate({ id: 'b', ...base }), expectedYasnogorsk);
    const sel = selectBestCandidate([a, b]);
    // равные сильные кандидаты (9 и 9): margin=0 → не high, а medium
    expect(sel.confidence).toBe('medium');
  });

  it('score < 1 → не принимается', () => {
    const c = candidate({
      admDiv: [{ name: 'Ясногорский район', type: 'district' }],
      components: { settlement: 'Другое', street: null, house: null },
    });
    const s = scoreCandidate(c, expectedYasnogorsk);
    expect(s.score).toBe(3); // только район
    const sel = selectBestCandidate([s]);
    expect(sel.confidence).toBe('low');
    expect(sel.best).toBe(s);
  });
});

describe('extractComponents (ответ 2ГИС)', () => {
  it('«Тула, Большая улица, 8»', () => {
    expect(extractComponents('Тула, Большая улица, 8')).toEqual({
      settlement: 'Тула',
      street: 'Большая улица',
      house: '8',
    });
  });
  it('«Ясногорск, улица Л. Толстого, д. 13»', () => {
    expect(extractComponents('Ясногорск, улица Л. Толстого, д. 13')).toMatchObject({
      settlement: 'Ясногорск',
      house: '13',
    });
  });
});

describe('extractExpectedFromAddress (адреса из CSV)', () => {
  it('«Тульская обл., г. Ясногорск, ул.Л.Толстого, д.13»', () => {
    const r = extractExpectedFromAddress('Тульская обл., г. Ясногорск, ул.Л.Толстого, д.13');
    expect(r.settlement).toMatch(/ясногорск/i);
    expect(r.street).toMatch(/толстого/i);
    expect(r.house).toBe('13');
  });
  it('«г. Тула, пр. Ленина, д. 87»', () => {
    const r = extractExpectedFromAddress('г. Тула, пр. Ленина, д. 87');
    expect(r.settlement).toMatch(/тула/i);
    expect(r.house).toBe('87');
  });
  it('«Тульская обл., г. Алексин, ул. Героев Алексинцев, з/у 8Б»', () => {
    const r = extractExpectedFromAddress('Тульская обл., г. Алексин, ул. Героев Алексинцев, з/у 8Б');
    expect(r.house).toBe('8Б');
  });
});
