-- ============================================================================
-- PostGIS и pgcrypto: пространственные типы/индексы и gen_random_uuid().
-- Добавлено вручную — `prisma migrate diff` не генерирует CREATE EXTENSION.
-- Должно выполняться ДО создания таблиц с колонками geometry.
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Ownership" AS ENUM ('state', 'municipal', 'unknown');

-- CreateEnum
CREATE TYPE "GeocodeSource" AS ENUM ('csv', 'geocoder', 'manual', 'inferred_from_name');

-- CreateEnum
CREATE TYPE "GeocodeConfidence" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "MunicipalitySource" AS ENUM ('csv_column', 'geometry', 'inferred_address', 'inferred_name');

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('customer', 'contractor', 'grbs');

-- CreateEnum
CREATE TYPE "ProgramLevel" AS ENUM ('np_gp', 'fp');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('before_sat', 'process_photo', 'process_video', 'after_render', 'document', 'camera_snapshot');

-- CreateEnum
CREATE TYPE "CameraType" AS ENUM ('hls', 'rtsp', 'snapshot');

-- CreateEnum
CREATE TYPE "ContractSource" AS ENUM ('eis', 'regional', 'manual', 'mock');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('new', 'in_review', 'accepted', 'rejected', 'resolved', 'forwarded');

-- CreateEnum
CREATE TYPE "AppealAuthorType" AS ENUM ('anon', 'esia');

-- CreateEnum
CREATE TYPE "SatisfactionSource" AS ENUM ('pos', 'gov_to', 'mock');

-- CreateEnum
CREATE TYPE "Sphere" AS ENUM ('education', 'health', 'sport', 'energy', 'culture');

-- CreateEnum
CREATE TYPE "LoadClass" AS ENUM ('deficit', 'border', 'normal', 'surplus', 'no_data');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('public', 'editor', 'moderator', 'admin');

-- CreateTable
CREATE TABLE "municipalities" (
    "id" TEXT NOT NULL,
    "oktmo" TEXT,
    "name_short" TEXT NOT NULL,
    "name_full" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "admin_center" TEXT,
    "osm_name" TEXT,
    "osm_relation_id" INTEGER,
    "center" geometry(Point,4326),
    "geom" geometry(MultiPolygon,4326),
    "area_km2" DECIMAL(12,3),
    "population" INTEGER,
    "population_year" INTEGER,
    "population_source" TEXT,
    "density_per_km2" DECIMAL(12,3),
    "geom_is_mock" BOOLEAN NOT NULL DEFAULT false,
    "geom_source" TEXT,

    CONSTRAINT "municipalities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "industries" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sphere" "Sphere",
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "industries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statuses" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group_code" TEXT NOT NULL,
    "color_hex" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" SERIAL NOT NULL,
    "type" "OrganizationType" NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "name_raw" TEXT NOT NULL,
    "inn" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programs" (
    "id" SERIAL NOT NULL,
    "level" "ProgramLevel" NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "code" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capacity_units" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "capacity_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ext_id" TEXT,
    "source_row_number" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "source_file_hash" TEXT,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "grbs_id" INTEGER,
    "industry_id" INTEGER,
    "status_id" INTEGER,
    "ownership" "Ownership" NOT NULL DEFAULT 'unknown',
    "municipality_id" TEXT,
    "municipality_source" "MunicipalitySource",
    "municipality_confidence" "GeocodeConfidence",
    "municipality_conflict" BOOLEAN NOT NULL DEFAULT false,
    "address_raw" TEXT,
    "address_normalized" TEXT,
    "geom" geometry(Point,4326),
    "geocode_source" "GeocodeSource",
    "geocode_confidence" "GeocodeConfidence",
    "geocode_candidates" JSONB,
    "geocode_verified_at" TIMESTAMP(3),
    "customer_id" INTEGER,
    "contractor_id" INTEGER,
    "contractor_contract_refs" JSONB,
    "program_np_id" INTEGER,
    "program_fp_id" INTEGER,
    "project_code" TEXT,
    "area_m2" DECIMAL(14,2),
    "capacity_value" DECIMAL(14,3),
    "capacity_unit_id" INTEGER,
    "capacity_parts" JSONB,
    "capacity_raw" TEXT,
    "expertise" JSONB,
    "year_start" INTEGER,
    "year_end" INTEGER,
    "construction_period" TEXT,
    "construction_stage" TEXT,
    "land_transfer_date" DATE,
    "permit_date" DATE,
    "contract_date" DATE,
    "contract_period_start" DATE,
    "contract_period_end" DATE,
    "contract_period_raw" TEXT,
    "contract_period_note" TEXT,
    "readiness_pct" DECIMAL(5,2),
    "equipment_date" DATE,
    "hydraulic_test_date" DATE,
    "zos_date" DATE,
    "zos_number" TEXT,
    "act_date" DATE,
    "act_number" TEXT,
    "commissioning_year" INTEGER,
    "photo_date" DATE,
    "timeline" JSONB,
    "history_of_place" JSONB,
    "risk_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "data_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "manual_override" JSONB,
    "needs_moderation" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" SERIAL NOT NULL,
    "object_id" UUID NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "url" TEXT NOT NULL,
    "storage_key" TEXT,
    "taken_at" TIMESTAMP(3),
    "bounds" JSONB,
    "year" INTEGER,
    "caption" TEXT,
    "license" TEXT,
    "is_mock" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "camera_sources" (
    "id" SERIAL NOT NULL,
    "object_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" "CameraType" NOT NULL,
    "url" TEXT NOT NULL,
    "refresh_sec" INTEGER,
    "access_token_ref" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_mock" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "camera_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" SERIAL NOT NULL,
    "object_id" UUID,
    "eis_id" TEXT,
    "number" TEXT,
    "date" DATE,
    "price" DECIMAL(18,2),
    "stage" TEXT,
    "status" TEXT,
    "customer" TEXT,
    "contractor" TEXT,
    "execution_start" DATE,
    "execution_end" DATE,
    "source" "ContractSource" NOT NULL DEFAULT 'mock',
    "fetched_at" TIMESTAMP(3),
    "raw" JSONB,
    "url" TEXT,
    "is_mock" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeal_categories" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sla_days" INTEGER NOT NULL,
    "requires_comment" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "appeal_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "public_id" TEXT NOT NULL,
    "object_id" UUID,
    "category_id" INTEGER NOT NULL,
    "municipality_id" TEXT,
    "geom" geometry(Point,4326),
    "address_text" TEXT,
    "description" TEXT NOT NULL,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "author_type" "AppealAuthorType" NOT NULL DEFAULT 'anon',
    "author_contacts" JSONB,
    "status" "AppealStatus" NOT NULL DEFAULT 'new',
    "moderator_note" TEXT,
    "pos_ticket_id" TEXT,
    "esia_ref" TEXT,
    "description_anonymized" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "is_mock" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citizen_satisfaction" (
    "id" SERIAL NOT NULL,
    "municipality_id" TEXT NOT NULL,
    "industry_id" INTEGER,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "appeals_total" INTEGER NOT NULL,
    "appeals_positive" INTEGER NOT NULL,
    "appeals_negative" INTEGER NOT NULL,
    "avg_response_days" DECIMAL(6,2),
    "overdue_count" INTEGER NOT NULL,
    "repeat_rate" DECIMAL(5,4),
    "satisfaction_index" DECIMAL(5,2),
    "population_ref" INTEGER,
    "source" "SatisfactionSource" NOT NULL DEFAULT 'mock',
    "raw" JSONB,
    "is_mock" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "citizen_satisfaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_provision" (
    "id" SERIAL NOT NULL,
    "municipality_id" TEXT NOT NULL,
    "sphere" "Sphere" NOT NULL,
    "actual_capacity" DECIMAL(16,3),
    "normative_per_1000" DECIMAL(10,3),
    "population" DECIMAL(14,2),
    "provision_index" DECIMAL(8,4),
    "load_class" "LoadClass" NOT NULL DEFAULT 'no_data',
    "objects_count" INTEGER NOT NULL,
    "include_planned" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT,
    "is_mock" BOOLEAN NOT NULL DEFAULT false,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_provision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "normatives" (
    "id" SERIAL NOT NULL,
    "sphere" "Sphere" NOT NULL,
    "name" TEXT NOT NULL,
    "value_per_1000" DECIMAL(10,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "approved_by_customer" BOOLEAN NOT NULL DEFAULT false,
    "valid_from" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "normatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "isochrone_cache" (
    "id" SERIAL NOT NULL,
    "object_id" UUID,
    "transport" TEXT NOT NULL DEFAULT 'walking',
    "duration_sec" INTEGER NOT NULL,
    "reverse" BOOLEAN NOT NULL DEFAULT false,
    "geom" geometry(MultiPolygon,4326),
    "poi_snapshot" JSONB,
    "api_version" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "isochrone_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "diff" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'public',
    "name" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT,
    "esia_id" TEXT,
    "permissions" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "municipalities_oktmo_key" ON "municipalities"("oktmo");

-- CreateIndex
CREATE INDEX "municipalities_geom_idx" ON "municipalities" USING GIST ("geom");

-- CreateIndex
CREATE UNIQUE INDEX "industries_code_key" ON "industries"("code");

-- CreateIndex
CREATE UNIQUE INDEX "statuses_code_key" ON "statuses"("code");

-- CreateIndex
CREATE INDEX "organizations_name_normalized_idx" ON "organizations"("name_normalized");

-- CreateIndex
CREATE INDEX "organizations_aliases_idx" ON "organizations" USING GIN ("aliases");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_type_name_normalized_key" ON "organizations"("type", "name_normalized");

-- CreateIndex
CREATE INDEX "programs_aliases_idx" ON "programs" USING GIN ("aliases");

-- CreateIndex
CREATE UNIQUE INDEX "programs_level_name_normalized_key" ON "programs"("level", "name_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "capacity_units_code_key" ON "capacity_units"("code");

-- CreateIndex
CREATE UNIQUE INDEX "objects_source_row_number_key" ON "objects"("source_row_number");

-- CreateIndex
CREATE INDEX "objects_geom_idx" ON "objects" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "objects_raw_idx" ON "objects" USING GIN ("raw");

-- CreateIndex
CREATE INDEX "objects_timeline_idx" ON "objects" USING GIN ("timeline");

-- CreateIndex
CREATE INDEX "objects_risk_flags_idx" ON "objects" USING GIN ("risk_flags");

-- CreateIndex
CREATE INDEX "objects_status_id_industry_id_idx" ON "objects"("status_id", "industry_id");

-- CreateIndex
CREATE INDEX "objects_municipality_id_idx" ON "objects"("municipality_id");

-- CreateIndex
CREATE INDEX "objects_commissioning_year_idx" ON "objects"("commissioning_year");

-- CreateIndex
CREATE INDEX "media_assets_object_id_kind_idx" ON "media_assets"("object_id", "kind");

-- CreateIndex
CREATE INDEX "camera_sources_object_id_idx" ON "camera_sources"("object_id");

-- CreateIndex
CREATE INDEX "contracts_object_id_idx" ON "contracts"("object_id");

-- CreateIndex
CREATE UNIQUE INDEX "appeal_categories_code_key" ON "appeal_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "appeals_public_id_key" ON "appeals"("public_id");

-- CreateIndex
CREATE INDEX "appeals_geom_idx" ON "appeals" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "appeals_object_id_idx" ON "appeals"("object_id");

-- CreateIndex
CREATE INDEX "appeals_category_id_idx" ON "appeals"("category_id");

-- CreateIndex
CREATE INDEX "appeals_status_idx" ON "appeals"("status");

-- CreateIndex
CREATE INDEX "citizen_satisfaction_municipality_id_period_start_idx" ON "citizen_satisfaction"("municipality_id", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "citizen_satisfaction_municipality_id_industry_id_period_sta_key" ON "citizen_satisfaction"("municipality_id", "industry_id", "period_start");

-- CreateIndex
CREATE INDEX "social_provision_sphere_idx" ON "social_provision"("sphere");

-- CreateIndex
CREATE UNIQUE INDEX "social_provision_municipality_id_sphere_include_planned_key" ON "social_provision"("municipality_id", "sphere", "include_planned");

-- CreateIndex
CREATE INDEX "normatives_sphere_idx" ON "normatives"("sphere");

-- CreateIndex
CREATE INDEX "isochrone_cache_geom_idx" ON "isochrone_cache" USING GIST ("geom");

-- CreateIndex
CREATE UNIQUE INDEX "isochrone_cache_object_id_transport_duration_sec_reverse_key" ON "isochrone_cache"("object_id", "transport", "duration_sec", "reverse");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "objects" ADD CONSTRAINT "objects_grbs_id_fkey" FOREIGN KEY ("grbs_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objects" ADD CONSTRAINT "objects_industry_id_fkey" FOREIGN KEY ("industry_id") REFERENCES "industries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objects" ADD CONSTRAINT "objects_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "statuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objects" ADD CONSTRAINT "objects_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objects" ADD CONSTRAINT "objects_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objects" ADD CONSTRAINT "objects_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objects" ADD CONSTRAINT "objects_program_np_id_fkey" FOREIGN KEY ("program_np_id") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objects" ADD CONSTRAINT "objects_program_fp_id_fkey" FOREIGN KEY ("program_fp_id") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objects" ADD CONSTRAINT "objects_capacity_unit_id_fkey" FOREIGN KEY ("capacity_unit_id") REFERENCES "capacity_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camera_sources" ADD CONSTRAINT "camera_sources_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "appeal_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citizen_satisfaction" ADD CONSTRAINT "citizen_satisfaction_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_provision" ADD CONSTRAINT "social_provision_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "isochrone_cache" ADD CONSTRAINT "isochrone_cache_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

