/**
 * @oks/shared — общие контракты, справочники и утилиты портала.
 * Используется фронтендом, бэкендом и ETL: единый источник правды
 * для типов API, цветов легенд и справочных значений.
 */

export * from './types/domain';
export * from './types/api';
export * from './types/geo';
export * from './types/accessibility';

export * from './dictionaries/statuses';
export * from './dictionaries/industries';
export * from './dictionaries/municipalities';
export * from './dictionaries/capacityUnits';
export * from './dictionaries/appealCategories';

export * from './config/region';
export * from './config/palette';
export * from './config/poiRubrics';
export * from './config/isochrone';
export * from './config/thresholds';
export * from './config/mockGeneration';

export * from './utils/format';
export * from './utils/objects';
export * from './utils/rng';
export * from './utils/satisfaction';
export * from './utils/geo';
