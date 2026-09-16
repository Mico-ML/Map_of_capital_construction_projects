import { describe, expect, it } from 'vitest';
import {
  cleanWhitespace,
  isBlank,
  normalizeAddressText,
  normalizeArea,
  normalizeCapacity,
  normalizeIndustry,
  normalizeMunicipalityColumn,
  normalizeOrgName,
  normalizeOwnership,
  normalizeProgramName,
  normalizeQuotes,
  normalizeReadiness,
  normalizeStatus,
  inferMunicipalityFromText,
  parseDateRange,
  parseExpertise,
  parseRuDate,
  parseRuNumber,
  parseYearOrDate,
} from '../src/normalize';
import { PROGRAM_FP_ALIASES, PROGRAM_NP_ALIASES } from '../src/config/aliases';

describe('Очистка и пустые значения (§6.1 п.2)', () => {
  it('NBSP/переводы строк → пробелы, схлопывание', () => {
    expect(cleanWhitespace('Министерство\u00A0сельского  хозяйства\n')).toBe('Министерство сельского хозяйства');
  });
  it('пустые токены: "", "-", "—"', () => {
    expect(isBlank('')).toBe(true);
    expect(isBlank('-')).toBe(true);
    expect(isBlank('—')).toBe(true);
    expect(isBlank('0')).toBe(false); // «0» — не пустота сама по себе
  });
  it('zeroIsEmpty: «0» в смысловом поле → null', () => {
    expect(isBlank('0')).toBe(false);
  });
});

describe('Числа (§6.1 п.3): неразрывные пробелы, запятая-разделитель', () => {
  it('«5 556,00» (NBSP) → 5556', () => {
    expect(parseRuNumber('5\u00A0556,00')).toBe(5556);
  });
  it('«13572,8» → 13572.8', () => {
    expect(parseRuNumber('13572,8')).toBe(13572.8);
  });
  it('«12791» → 12791, «1 495,00» → 1495', () => {
    expect(parseRuNumber('12791')).toBe(12791);
    expect(parseRuNumber('1\u00A0495,00')).toBe(1495);
  });
  it('мусор → null', () => {
    expect(parseRuNumber('-')).toBeNull();
    expect(parseRuNumber('')).toBeNull();
    expect(parseRuNumber('12abc')).toBeNull();
  });
});

describe('Даты (§6.1 п.4)', () => {
  it('ДД.ММ.ГГГГ → ISO', () => {
    expect(parseRuDate('28.10.2022')).toBe('2022-10-28');
    expect(parseRuDate(' 01.12.2023 ')).toBe('2023-12-01');
  });
  it('некорректная календарная дата → null', () => {
    expect(parseRuDate('31.02.2023')).toBeNull();
    expect(parseRuDate('29.02.2023')).toBeNull();
    expect(parseRuDate('29.02.2024')).toBe('2024-02-29');
  });
  it('год из полной даты («01.01.2026» → 2026)', () => {
    expect(parseYearOrDate('2022')).toEqual({ year: 2022 });
    expect(parseYearOrDate('01.01.2026')).toEqual({ year: 2026, note: 'год извлечён из полной даты' });
    expect(parseYearOrDate('')).toEqual({ year: null });
  });
});

describe('Диапазоны дат — все фактические форматы источника', () => {
  it('стандартный и с пробелами/en-dash', () => {
    expect(parseDateRange('15.09.2022-28.10.2022')).toEqual({ start: '2022-09-15', end: '2022-10-28', raw: '15.09.2022-28.10.2022' });
    const spaced = parseDateRange('29.12.2021 – 31.03.2023');
    expect(spaced?.start).toBe('2021-12-29');
    expect(spaced?.end).toBe('2023-03-31');
    expect(parseDateRange('01.08.2023 - 25.11.2024')?.end).toBe('2024-11-25');
    expect(parseDateRange('22.09.2022- 01.12.2023')?.start).toBe('2022-09-22');
  });
  it('«с X по Y»', () => {
    const r = parseDateRange('с 27.01.2026 по 01.09.2027');
    expect(r).toMatchObject({ start: '2026-01-27', end: '2027-09-01' });
  });
  it('опечатка «10-03-2025-30.03.2026»', () => {
    const r = parseDateRange('10-03-2025-30.03.2026');
    expect(r).toMatchObject({ start: '2025-03-10', end: '2026-03-30' });
    expect(r?.note).toMatch(/опечатка/i);
  });
  it('опечатка «26.12.2023-10.12-2024»', () => {
    const r = parseDateRange('26.12.2023-10.12-2024');
    expect(r).toMatchObject({ start: '2023-12-26', end: '2024-12-10' });
    expect(r?.note).toMatch(/опечатка/i);
  });
  it('двухзначные годы «21.11.25-01.06.27»', () => {
    const r = parseDateRange('21.11.25-01.06.27');
    expect(r).toMatchObject({ start: '2025-11-21', end: '2027-06-01' });
  });
  it('только годы «2025-2030» → без точных дат, raw сохранён', () => {
    const r = parseDateRange('2025-2030');
    expect(r).toMatchObject({ start: null, end: null, raw: '2025-2030' });
    expect(r?.note).toMatch(/годы/i);
  });
  it('одна дата «15.12.2025» → end + помета о подтверждении', () => {
    const r = parseDateRange('15.12.2025');
    expect(r).toMatchObject({ start: null, end: '2025-12-15' });
    expect(r?.note).toMatch(/требует подтверждения/i);
  });
  it('пусто → null', () => {
    expect(parseDateRange('-')).toBeNull();
    expect(parseDateRange('')).toBeNull();
  });
});

describe('Кавычки и организации (§6.1 п.5)', () => {
  it('прямые кавычки → «ёлочки»', () => {
    expect(normalizeQuotes('ООО "СИМВОЛ"')).toBe('ООО «СИМВОЛ»');
  });
  it('слияние дублей регистра/кавычек через алиасы', () => {
    for (const variant of ['ООО "СИМВОЛ"', 'ООО «Символ»']) {
      expect(normalizeOrgName(variant).canonical).toBe('ООО «Символ»');
    }
    for (const variant of ['АО "ГК "ЕКС"', 'АО «ГК «ЕКС»', 'АО ГК ЕКС']) {
      expect(normalizeOrgName(variant).canonical).toBe('АО «ГК ЕКС»');
    }
    for (const variant of ['ООО "СтройЭталон финанс"', 'ООО «СтройЭталонФинанс»', 'ООО "Стройэталонфинанс"']) {
      expect(normalizeOrgName(variant).canonical).toBe('ООО «СтройЭталонФинанс»');
    }
  });
  it('вероятные опечатки сливаются с пометой', () => {
    const r = normalizeOrgName('ООО "Помэковод" № 1 от  26.09.2024');
    expect(r.canonical).toBe('ООО «Промэковод»');
    expect(r.contractRefs).toEqual([{ number: '1', date: '2024-09-26', raw: expect.any(String) }]);
    expect(r.note).toMatch(/опечатк/i);
    expect(normalizeOrgName('ООО "ЭНЕРГПРОЕКТ"').canonical).toBe('ООО «Энергопроект»');
  });
  it('контрактные реквизиты извлекаются из ячейки (хвост и начало)', () => {
    const tail = normalizeOrgName('АО "Спецмонтажналадка" № 03662000356250069860001 от 20.10.2025');
    expect(tail.canonical).toBe('АО «Спецмонтажналадка»');
    expect(tail.contractRefs[0]).toMatchObject({ number: '03662000356250069860001', date: '2025-10-20' });
    const lead = normalizeOrgName('№ 0366200035626003550 от 15.06.2026  ООО "ПРОМЭКОВОД"');
    expect(lead.canonical).toBe('ООО «Промэковод»');
    expect(lead.contractRefs[0]).toMatchObject({ number: '0366200035626003550', date: '2026-06-15' });
  });
  it('«№ 1» внутри названия не считается реквизитом', () => {
    const r = normalizeOrgName('ООО "ПОВОЛЖСКИЙ СТРОИТЕЛЬНЫЙ КОМБИНАТ № 1" № 271 от 24.11.2025');
    expect(r.canonical).toBe('ООО «ПОВОЛЖСКИЙ СТРОИТЕЛЬНЫЙ КОМБИНАТ № 1»');
    expect(r.contractRefs).toHaveLength(1);
    expect(r.contractRefs[0]?.number).toBe('271');
  });
  it('ролевой суффикс (ПИР) снимается с пометой', () => {
    const r = normalizeOrgName('ООО "МВ-Проект" (ПИР)');
    expect(r.canonical).toBe('ООО «МВ-Проект»');
    expect(r.note).toMatch(/ПИР/);
  });
  it('составной заказчик: основная организация + помета', () => {
    const r = normalizeOrgName('ГУКС "ТулоблУКС", АМО г. Донской');
    expect(r.canonical).toBe('ГУКС «ТулоблУКС»');
    expect(r.note).toMatch(/составная запись/);
  });
  it('пробел после оргформы без него: «ООО«Энергопроект»»', () => {
    expect(normalizeOrgName('ООО«Энергопроект»').canonical).toBe('ООО «Энергопроект»');
  });
  it('полное наименование УКС Новомосковска сливается с сокращённым', () => {
    expect(normalizeOrgName('МУ "Управление капитальным строительства город Новомосковск"').canonical).toBe(
      'МУ «УКС г. Новомосковск»',
    );
  });
  it('«0» и пусто → null', () => {
    expect(normalizeOrgName('0').canonical).toBeNull();
    expect(normalizeOrgName('').canonical).toBeNull();
    expect(normalizeOrgName('-').canonical).toBeNull();
  });
});

describe('Программы НП/ГП и ФП', () => {
  it('слияние вариантов ГП ЖКХ (3 написания + подпрограммы в raw)', () => {
    const a = normalizeProgramName(
      'ГП "Обеспечение качественными услугами жилищно-коммунального хозяйства населения Тульской области" РП "Чистая вода Тульской области"',
      PROGRAM_NP_ALIASES,
    );
    const b = normalizeProgramName(
      'ГП: "Обеспечение качественными услугами жилищно-коммунального хозяйства населения Тульской области" РП: "Строительство и капитальный ремонт объектов коммунальной инфраструктуры"',
      PROGRAM_NP_ALIASES,
    );
    const c = normalizeProgramName(
      'Обеспечение качественными услугами жилищно-коммунального хозяйства населения Тульской области',
      PROGRAM_NP_ALIASES,
    );
    expect(a.canonical).toBe(b.canonical);
    expect(b.canonical).toBe(c.canonical);
    expect(a.note).toMatch(/подпрограмма/i);
  });
  it('«НП Демография» и «Демография» → один канон', () => {
    expect(normalizeProgramName('НП Демография', PROGRAM_NP_ALIASES).canonical).toBe('НП «Демография»');
    expect(normalizeProgramName('Демография', PROGRAM_NP_ALIASES).canonical).toBe('НП «Демография»');
  });
  it('опечатка с хвостовой «и» исправляется', () => {
    const r = normalizeProgramName(
      'государственная программа Тульской области "Развитие здравоохранения Тульской области"и',
      PROGRAM_NP_ALIASES,
    );
    expect(r.canonical).toBe('ГП ТО «Развитие здравоохранения Тульской области»');
  });
  it('ФП: варианты «Бизнес-спринт» сливаются', () => {
    const a = normalizeProgramName('Бизнес - спринт "Я выбираю спорт"', PROGRAM_FP_ALIASES);
    const b = normalizeProgramName('ФП "Бизнес спринт" (Я выбираю спорт)', PROGRAM_FP_ALIASES);
    expect(a.canonical).toBe('Бизнес-спринт (Я выбираю спорт)');
    expect(b.canonical).toBe(a.canonical);
  });
  it('NBSP в названии ФП не мешает', () => {
    const r = normalizeProgramName('«Развитие инфраструктуры в\u00A0населенных пунктах»', PROGRAM_FP_ALIASES);
    expect(r.canonical).toBe('Развитие инфраструктуры в населенных пунктах');
  });
});

describe('Отрасль: нормализация и восстановление по ГРБС (§6.1 п.7)', () => {
  it('разнобой ЖКХ сливается', () => {
    const r = normalizeIndustry('Жилищно коммунальное хозяйство', null);
    expect(r.industryCode).toBe('housing_utilities');
    expect(r.industrySource).toBe('csv');
    expect(r.note).toMatch(/без дефиса/);
    expect(normalizeIndustry('Жилищно-коммунальное хозяйство', null).industryCode).toBe('housing_utilities');
  });
  it('«0» + Министерство энергетики ТО → Энергетика (inferred)', () => {
    const r = normalizeIndustry('0', 'Министерство энергетики ТО');
    expect(r).toMatchObject({ industryCode: 'energy', industrySource: 'inferred', needsModeration: false });
  });
  it('«0» + Министерство сельского хозяйства… → agriculture_ecology', () => {
    const r = normalizeIndustry('0', 'Министерство сельского хозяйства, природных ресурсов и экологии ТО');
    expect(r.industryCode).toBe('agriculture_ecology');
  });
  it('«0» + АМО г. Тула → модерация (ГРБС неоднозначен)', () => {
    const r = normalizeIndustry('0', 'АМО г. Тула');
    expect(r).toMatchObject({ industryCode: null, needsModeration: true });
  });
  it('«0» + Министерство строительства ТО → модерация', () => {
    expect(normalizeIndustry('0', 'Министерство строительства ТО').needsModeration).toBe(true);
  });
  it('значение с переводом строки («Здравоохранение\\n») распознаётся', () => {
    expect(normalizeIndustry('Здравоохранение\n', null).industryCode).toBe('health');
  });
});

describe('Статусы и собственность', () => {
  it('6 статусов → группы (Приложение B)', () => {
    expect(normalizeStatus('Введен в эксплуатацию')).toMatchObject({ statusCode: 'commissioned', statusGroup: 'completed' });
    expect(normalizeStatus('СМР')).toMatchObject({ statusGroup: 'construction' });
    expect(normalizeStatus('ПИР')).toMatchObject({ statusGroup: 'design' });
    expect(normalizeStatus('ПИР+СМР')).toMatchObject({ statusGroup: 'construction' });
    expect(normalizeStatus('Подготовка электронного аукциона (ЭА)')).toMatchObject({ statusGroup: 'procurement' });
    expect(normalizeStatus('Бюджетные инвестиции')).toMatchObject({ statusGroup: 'procurement' });
    expect(normalizeStatus('что-то новое').statusCode).toBeNull();
  });
  it('собственность: «0» → unknown, перевод строки в значении не мешает', () => {
    expect(normalizeOwnership('Муниципальная')).toBe('municipal');
    expect(normalizeOwnership('Муниципальная\n')).toBe('municipal');
    expect(normalizeOwnership('Государственная')).toBe('state');
    expect(normalizeOwnership('0')).toBe('unknown');
  });
});

describe('МО: колонка «АМО» (24 варианта → 20 МО)', () => {
  it('падежные варианты сливаются', () => {
    expect(normalizeMunicipalityColumn('АМО Киреевский район').municipalityId).toBe('kireevsky');
    expect(normalizeMunicipalityColumn('АМО Киреевского района').municipalityId).toBe('kireevsky');
    expect(normalizeMunicipalityColumn('АМО Щекинский район').municipalityId).toBe('shchyokinsky');
    expect(normalizeMunicipalityColumn('АМО Щекинского района').municipalityId).toBe('shchyokinsky');
    expect(normalizeMunicipalityColumn('АМО г. Тула').municipalityId).toBe('tula');
    expect(normalizeMunicipalityColumn('АМО Славный').municipalityId).toBe('slaviy');
    expect(normalizeMunicipalityColumn('АМО Каменского района').municipalityId).toBe('kamensky');
  });
  it('«0» → null (восстановление из адреса/наименования)', () => {
    expect(normalizeMunicipalityColumn('0').municipalityId).toBeNull();
  });
});

describe('Извлечение НП из текста (адрес/наименование)', () => {
  it('«микрорайон Суворовский 2, г. Тула» → Тула', () => {
    expect(inferMunicipalityFromText('Строительство школы на 1100 мест в микрорайоне Суворовский 2, г. Тула').municipalityId).toBe('tula');
  });
  it('г. Липки → Киреевский район', () => {
    expect(inferMunicipalityFromText('Строительство станции водоподготовки в г. Липки').municipalityId).toBe('kireevsky');
  });
  it('опечатка «п. Заокск» → Заокский', () => {
    expect(inferMunicipalityFromText('ФОК с плавательным бассейном в п. Заокск').municipalityId).toBe('zaoksky');
  });
  it('п. Дубна → Дубенский, п. Каменка → Каменский, п. Волово → Воловский', () => {
    expect(inferMunicipalityFromText('Модульный бассейн в п. Дубна').municipalityId).toBe('dubensky');
    expect(inferMunicipalityFromText('Модульный спортивный зал в п. Каменка').municipalityId).toBe('kamensky');
    expect(inferMunicipalityFromText('Модульный спортивный зал в п. Волово').municipalityId).toBe('volovsky');
  });
  it('без совпадений → null', () => {
    expect(inferMunicipalityFromText('Строительство чего-то где-то').municipalityId).toBeNull();
  });
});

describe('Площадь, мощность, готовность', () => {
  it('площадь: 0/0,00 → null с признаком', () => {
    expect(normalizeArea('5\u00A0556,00')).toMatchObject({ areaM2: 5556, zeroInSource: false });
    expect(normalizeArea('0')).toMatchObject({ areaM2: null, zeroInSource: true });
    expect(normalizeArea('0,00')).toMatchObject({ areaM2: null, zeroInSource: true });
    expect(normalizeArea('13572,8').areaM2).toBe(13572.8);
  });
  it('мощность: «400 посещений, 340 коек» → 2 части', () => {
    const r = normalizeCapacity('400 посещений, 340 коек');
    expect(r.parts).toHaveLength(2);
    expect(r.parts[0]).toMatchObject({ value: 400, unitCode: 'visits_per_shift' });
    expect(r.parts[1]).toMatchObject({ value: 340, unitCode: 'bed_places' });
    expect(r.value).toBe(400);
  });
  it('мощность: единицы из данных', () => {
    expect(normalizeCapacity('244 койко мест')).toMatchObject({ value: 244, unitCode: 'bed_places' });
    expect(normalizeCapacity('208 м3 / ч')).toMatchObject({ value: 208, unitCode: 'm3_per_hour' });
    expect(normalizeCapacity('1,8 мВТ')).toMatchObject({ value: 1.8, unitCode: 'mw' });
    expect(normalizeCapacity('2190 кВт')).toMatchObject({ value: 2190, unitCode: 'kw' });
    expect(normalizeCapacity('6 Гкал/час')).toMatchObject({ value: 6, unitCode: 'gcal_per_hour' });
    expect(normalizeCapacity('75 квартир')).toMatchObject({ value: 75, unitCode: 'apartments' });
    expect(normalizeCapacity('12 посещений в смену')).toMatchObject({ value: 12, unitCode: 'visits_per_shift' });
    expect(normalizeCapacity('150 кубический метр в час')).toMatchObject({ value: 150, unitCode: 'm3_per_hour' });
    expect(normalizeCapacity('1000 м3/сутки')).toMatchObject({ value: 1000, unitCode: 'm3_per_day' });
  });
  it('«голое» число — в «мест» (заголовок колонки: «кол-во мест»)', () => {
    expect(normalizeCapacity('1100')).toMatchObject({ value: 1100, unitCode: 'places' });
  });
  it('диапазон «2500-3000м3/сут» — значением не выдумывается', () => {
    const r = normalizeCapacity('2500-3000м3/сут');
    expect(r.value).toBeNull();
    expect(r.raw).toBe('2500-3000м3/сут');
    expect(r.note).toMatch(/диапазон/i);
  });
  it('«0» → null', () => {
    expect(normalizeCapacity('0').value).toBeNull();
  });
  it('готовность: «0,00» при ПИР — валидный 0; «88,50» → 88.5', () => {
    expect(normalizeReadiness('0,00')).toEqual({ value: 0 });
    expect(normalizeReadiness('88,50')).toEqual({ value: 88.5 });
    expect(normalizeReadiness('100')).toEqual({ value: 100 });
    expect(normalizeReadiness('').value).toBeNull();
  });
});

describe('Экспертиза (§5: несколько в ячейке, опечатки «№ №»)', () => {
  it('две экспертизы в одной ячейке', () => {
    const r = parseExpertise('от 27.12.2019 № 71-1-1-3-038991-2019, от 12.11.2021 № 71-1-1-2-066424-2021');
    expect(r.records).toHaveLength(2);
    expect(r.records[0]).toMatchObject({ date: '2019-12-27', number: '71-1-1-3-038991-2019' });
    expect(r.records[1]).toMatchObject({ date: '2021-11-12', number: '71-1-1-2-066424-2021' });
  });
  it('опечатка «№ №» исправляется с пометой', () => {
    const r = parseExpertise('от 23.11.2023 № № 71-1-1-2-070894-2023');
    expect(r.records[0]).toMatchObject({ date: '2023-11-23', number: '71-1-1-2-070894-2023' });
    expect(r.records[0]?.note).toMatch(/№ №/);
  });
  it('свободный текст вместо номера (стр. 41) → number=null + помета', () => {
    const r = parseExpertise(
      'от 01.01.2025 № Информация об экспертизе будет направлена после разработки и утверждения проектно-сметной документации. Плановый срок 01.06.2025',
    );
    expect(r.records).toHaveLength(1);
    expect(r.records[0]?.date).toBe('2025-01-01');
    expect(r.records[0]?.number).toBeNull();
    expect(r.records[0]?.raw).toContain('Информация об экспертизе');
  });
  it('«*» в номере сохраняется как в источнике', () => {
    const r = parseExpertise('от 23.12.2022 № 71-1-1-3-0919*23-2022');
    expect(r.records[0]?.number).toBe('71-1-1-3-0919*23-2022');
    expect(r.records[0]?.note).toMatch(/\*/);
  });
  it('пусто → []', () => {
    expect(parseExpertise('-').records).toEqual([]);
  });
});

describe('Адрес: лёгкая нормализация', () => {
  it('«г,Тула» → «г. Тула»', () => {
    expect(normalizeAddressText('г,Тула, д. Мыза, микрорайон «Северная Мыза»')).toBe(
      'г. Тула, д. Мыза, микрорайон «Северная Мыза»',
    );
  });
  it('«ул.Присягина» → «ул. Присягина», «обл,» → «обл.»', () => {
    expect(normalizeAddressText('Тульская обл, г. Новомосковск, ул.Присягина, д.9-а')).toBe(
      'Тульская обл., г. Новомосковск, ул. Присягина, д.9-а',
    );
  });
  it('«0»/пусто → null', () => {
    expect(normalizeAddressText('0')).toBeNull();
    expect(normalizeAddressText('')).toBeNull();
  });
});
