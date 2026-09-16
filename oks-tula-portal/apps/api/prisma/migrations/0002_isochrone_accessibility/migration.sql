-- ============================================================================
-- Итерация 4 (Ф4): кэш изохрон как источник для отчёта доступности и
-- пакетного режима «покрытие / белые пятна».
--
-- Зачем новые колонки:
--   start_point            — точка расчёта (для объектов без geom — центроид МО);
--   area_m2                — площадь зоны (ST_Area по geography), чтобы отчёт
--                            доступности не пересчитывал геометрию каждый раз;
--   location_approximate   — честная пометка «местоположение уточняется» (§6.3 п.7);
--   provider, is_mock      — разделение боевого расчёта 2ГИС и демо-модели
--                            (демо-зона никогда не выдаётся за результат API);
--   poi_generated_at       — отдельный срок жизни POI-снимка (Search API, квоты).
-- ============================================================================

-- AlterTable
ALTER TABLE "isochrone_cache"
  ADD COLUMN "start_point" geometry(Point,4326),
  ADD COLUMN "area_m2" DOUBLE PRECISION,
  ADD COLUMN "location_approximate" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "poi_generated_at" TIMESTAMP(3),
  ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'mock',
  ADD COLUMN "is_mock" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "isochrone_cache_object_id_is_mock_idx" ON "isochrone_cache"("object_id", "is_mock");

-- CreateIndex
CREATE INDEX "isochrone_cache_expires_at_idx" ON "isochrone_cache"("expires_at");

-- CreateIndex: сводное покрытие и «белые пятна» выбирают зоны по
-- (транспорт, время, направление, режим провайдера). Имя — по конвенции Prisma,
-- чтобы `prisma migrate diff` не фиксировал расхождение схемы и миграций.
CREATE INDEX "isochrone_cache_transport_duration_sec_reverse_is_mock_idx"
  ON "isochrone_cache"("transport", "duration_sec", "reverse", "is_mock");
