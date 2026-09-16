# DATA_MODEL — модель данных (PostgreSQL 16 + PostGIS 3.4)

Схема: `apps/api/prisma/schema.prisma` (источник типов) и
`apps/api/prisma/migrations/0001_init/migration.sql` (применяется `prisma migrate deploy`).
Геометрические колонки — PostGIS-типы (`geometry(Point,4326)`, `geometry(MultiPolygon,4326)`);
в Prisma объявлены `Unsupported` и обслуживаются raw-SQL. Расширения `postgis`, `pgcrypto`
создаются в начале миграции.

## Справочники

| Таблица | Ключевые поля | Назначение |
|---|---|---|
| `municipalities` | `id` (slug, PK), `oktmo` (уник.), `name_short/full`, `type`, `admin_center`, `osm_name`, `osm_relation_id`, `center` (Point), `geom` (MultiPolygon), `area_km2`, `population`, `population_year/source`, `density_per_km2`, `geom_is_mock`, `geom_source` | 26 МО области; границы OSM (ODbL), население — демо-источник |
| `industries` | `code` (уник.), `name`, `sphere` (enum: education/health/sport/energy/culture), `sort_order` | 11 отраслей (Приложение B) |
| `statuses` | `code`, `name`, `group_code` (design/construction/procurement/completed), `color_hex`, `sort_order` | 6 статусов реестра |
| `organizations` | `type` (customer/contractor/grbs), `name_normalized`, `name_raw`, `inn`, `aliases[]`, уник. `(type,name_normalized)` | ГРБС/заказчики/подрядчики; дубли слиты алиасами |
| `programs` | `level` (np_gp/fp), `name_normalized`, `code`, `aliases[]`, уник. `(level,name_normalized)` | НП/ГП и ФП |
| `capacity_units` | `code`, `name`, `aliases[]`, `sort_order` | Единицы мощности (Приложение B + Гкал/ч из данных) |
| `appeal_categories` | `code`, `title`, `description`, `sla_days`, `requires_comment`, `is_active` | 9 категорий жалоб (§7 Ф8) |
| `normatives` | `sphere`, `name`, `value_per_1000`, `unit`, `source`, `approved_by_customer`, `valid_from` | Нормативы обеспеченности (требуют утверждения) |

## Ядро: `objects`

Хранит нормализованные атрибуты + полную исходную строку.

- Идентификация: `id` (UUID, PK), `ext_id`, `source_row_number` (уник.), `source_file_hash`,
  `imported_at`, `raw` (JSONB — все 35 колонок как в источнике).
- Связи: `grbs_id`, `industry_id`, `status_id`, `municipality_id`, `customer_id`,
  `contractor_id`, `program_np_id`, `program_fp_id`, `capacity_unit_id`.
- Классификация: `ownership` (enum), `municipality_source` (csv_column/geometry/
  inferred_address/inferred_name), `municipality_confidence`, `municipality_conflict`.
- Гео: `address_raw`, `address_normalized`, `geom` (Point), `geocode_source`
  (csv/geocoder/manual/inferred_from_name), `geocode_confidence` (high/medium/low),
  `geocode_candidates` (JSONB), `geocode_verified_at`.
- Показатели: `area_m2`, `capacity_value`, `capacity_parts` (JSONB), `capacity_raw`,
  `readiness_pct`, `expertise` (JSONB `[{date,number,raw,note}]`).
- Сроки/документы: `year_start/end`, `construction_period/stage`, `land_transfer_date`,
  `permit_date`, `contract_date`, `contract_period_start/end/raw/note`, `equipment_date`,
  `hydraulic_test_date`, `zos_date/number`, `act_date/number`, `commissioning_year`, `photo_date`.
- Служебное: `timeline` (JSONB), `history_of_place` (JSONB), `risk_flags[]`, `data_flags[]`
  (пометки ETL), `manual_override` (JSONB), `needs_moderation`, `created_at`, `updated_at`.

**Индексы:** GiST на `geom`; GIN на `raw`, `timeline`, `risk_flags`; B-tree на FK,
`(status_id, industry_id)`, `municipality_id`, `commissioning_year`; unique на `source_row_number`.

## Производные и служебные таблицы

| Таблица | Назначение |
|---|---|
| `media_assets` | снимки «до/после», фото/видео процесса, рендеры, документы; `bounds` (геопривязка), `is_mock` (Ф3, итерация 3) |
| `camera_sources` | камеры подрядчиков (hls/rtsp/snapshot), `refresh_sec`, `is_mock` (Ф3) |
| `contracts` | закупки/контракты; `source` (eis/regional/manual/mock), `price`, `execution_start/end`, `is_mock` (Ф6) |
| `appeals` | обращения/жалобы; `geom`, `category_id`, `status`, `author_type`, `pos_ticket_id`, `description_anonymized`, `is_mock` (Ф8, итерация 6) |
| `citizen_satisfaction` | агрегаты обращений по МО×отрасль×период; `satisfaction_index`, `is_mock` (Ф7) |
| `social_provision` | обеспеченность по МО×сфера; `provision_index`, `load_class`, `include_planned` (Ф5, итерация 5) |
| `isochrone_cache` | кэш зон доступности (Ф4, реализовано): `geom` (MultiPolygon, GiST), `start_point`, `area_m2` (ST_Area), `duration_sec`, `reverse`, `transport`, `provider` + `is_mock` (боевой расчёт 2ГИС ≠ демо-модель), `location_approximate` (зона от центроида МО), `poi_snapshot` + `poi_generated_at` (снимок Search API), `api_version`, `generated_at`, `expires_at` (TTL 30 суток). Уникальность `(object_id, transport, duration_sec, reverse)`; индексы: GiST на `geom`, `(object_id, is_mock)`, `(transport, duration_sec, reverse, is_mock)`, `expires_at` |
| `audit_log` | аудит изменений и модерации; `actor`, `action`, `entity`, `diff` (JSONB) (§9) |
| `users` | роли public/editor/moderator/admin; `esia_id`, `password_hash`, `permissions` (итерация 6) |

## Перечисления (PostgreSQL enum)

`Ownership`, `GeocodeSource`, `GeocodeConfidence`, `MunicipalitySource`, `OrganizationType`,
`ProgramLevel`, `MediaKind`, `CameraType`, `ContractSource`, `AppealStatus`, `AppealAuthorType`,
`SatisfactionSource`, `Sphere`, `LoadClass`, `UserRole`.

## Соответствие колонок CSV → поля (§Приложение A)

Полная карта — в Приложении A ТЗ и в `etl/src/csv_parser.ts` (`COL`). Ключевые:
«Координаты.Широта/Долгота» → `geom`; «Отрасль» → `industry_id` (+ восстановление по ГРБС);
«АМО» → `municipality_id`; «Мошность» → `capacity_value/unit/parts/raw`; «ЭКСПЕРТИЗА(Ы)» →
`expertise` (JSONB); «Сроки контракта» → `contract_period_start/end/raw/note`;
«ЗОС/АКТ ВВОДА.дата/номер» → `zos_*`/`act_*`; «Фото» → `photo_date` (+ помета об ошибке источника).

## Качество данных

Отчёт `reports/data_quality.md` (+ `.json`) формируется ETL и содержит: заполненность всех
35 колонок, распределения, дубли координат/адресов, результаты геокодирования, конфликты
геометрии, аномалии «пакетных» дат, проблемные записи и рекомендации. Доступен через
`GET /api/v1/data-quality`.
