#!/usr/bin/env python3
"""
Подготовка архивных мозаик «До» (Sentinel-2 / Landsat) для слоя Ф3.

ВНИМАНИЕ: это ДОКУМЕНТИРУЕМЫЙ ШАБЛОН для боевого этапа 2 (docs/IMAGERY.md).
Он описывает полный пайплайн подготовки безоблачных годовых мозаик и нарезки
тайлов для публикации на GeoServer (WMS/WMTS), который затем подключается в
MapGL через RasterTileSource. Для запуска требуются GDAL/ rasterio и доступ к
архивам (Copernicus Open Access Hub / USGS EarthExplorer). В демо-режиме портал
использует мок-кадры из data/mock/media (generate_mock_media.py), а не эти мозаики.

Пайплайн (для каждого года и каждого объекта/МО):
  1. Отбор сцен  Sentinel-2 (10 м, с 2015) или Landsat (30 м, с 1984) за год,
     cloud cover < 10 %.
  2. Атмосферная коррекция (sen2cor для S2; LEDAPS/LaSRC для Landsat) → BOA.
  3. Маскирование облаков/теней (SCL для S2; QA-биты для Landsat).
  4. Композит «медиана/медианоид» по годам (cloud-free composite).
  5. Перепроецирование в EPSG:3857 (Web Mercator) и обрезка по bbox объекта/МО.
  6. Публикация на GeoServer как слой `sentinel2:s2_<year>_mosaic` (WMS/WMTS).
  7. (Опц.) нарезка XYZ-тайлов (gdal2tiles) для прямого RasterTileSource.

Требуемые пакеты: gdal (gdalwarp, gdalbuildvrt, gdal2tiles), rasterio, sentinelsat / landsatxplore.
Ключи/учётные данные архивов — только в переменных окружения (не в коде/логах, §15.11).

Пример использования (боевой контур):
  COPERNICUS_USER=... COPERNICUS_PASS=... \\
  python3 prepare_imagery_mosaic.py --year 2019 --bbox 37.5,54.1,37.8,54.3 --out ./mosaics
"""
from __future__ import annotations

import argparse
import subprocess
import sys


def run(cmd: list[str]) -> None:
    """Печать и выполнение shell-команды (с остановкой при ошибке)."""
    print(' '.join(cmd))
    subprocess.run(cmd, check=True)


def download_scenes(year: int, bbox: tuple[float, float, float, float], out: str) -> list[str]:
    """
    Шаг 1–2: отбор и скачивание сцен Sentinel-2 за год с cloud cover < 10 %.
    Реализация — через sentinelsat/Copernicus Open Access Hub (учётные данные из env).
    Возвращает список путей к .SAFE/COG-файлам. Здесь — заглушка-описание.
    """
    raise NotImplementedError(
        'Подключите sentinelsat/Copernicus Hub или USGS EarthExplorer (см. docstring). '
        f'Параметры: year={year}, bbox={bbox}, out={out}.'
    )


def build_mosaic(scenes: list[str], year: int, out: str) -> str:
    """Шаги 3–5: маскирование облаков, годовой композит, перепроецирование в EPSG:3857."""
    vrt = f'{out}/s2_{year}_boa.vrt'
    mosaic_3857 = f'{out}/s2_{year}_mosaic_3857.tif'
    # 3–4. Безоблачный годовой композит (медиана) — через rasterio/gdal
    #    (здесь предполагается предварительная атмосферная коррекция и маскирование SCL).
    run(['gdalbuildvrt', '-separate', vrt, *scenes])
    # 5. Перепроецирование в Web Mercator (EPSG:3857)
    run([
        'gdalwarp', '-t_srs', 'EPSG:3857', '-r', 'bilinear',
        '-co', 'COMPRESS=DEFLATE', vrt, mosaic_3857,
    ])
    return mosaic_3857


def cut_tiles(mosaic_3857: str, year: int, out: str) -> str:
    """Шаг 7: нарезка XYZ-тайлов (для прямого подключения RasterTileSource)."""
    tiles_dir = f'{out}/tiles_{year}'
    run([
        'gdal2tiles.py', '-z', '10-18', '-w', 'none',
        '--processes=4', mosaic_3857, tiles_dir,
    ])
    return tiles_dir


def main() -> int:
    parser = argparse.ArgumentParser(description='Подготовка годовых мозаик Sentinel-2/Landsat (этап 2)')
    parser.add_argument('--year', type=int, required=True)
    parser.add_argument('--bbox', type=str, required=True, help='minLon,minLat,maxLon,maxLat (EPSG:4326)')
    parser.add_argument('--out', type=str, default='./mosaics')
    parser.add_argument('--source', choices=['sentinel2', 'landsat'], default='sentinel2')
    args = parser.parse_args()

    bbox = tuple(float(x) for x in args.bbox.split(','))
    if len(bbox) != 4:
        print('bbox должен содержать 4 числа', file=sys.stderr)
        return 2

    print(
        'Шаблон подготовки мозаик. Для боевого запуска реализуйте download_scenes() '
        '(sentinelsat / landsatxplore) и настройте GeoServer (WMS/WMTS).\n'
        'См. docs/IMAGERY.md — полная процедура и подключение в MapGL RasterTileSource.'
    )
    try:
        scenes = download_scenes(args.year, bbox, args.out)  # type: ignore[arg-type]
        mosaic = build_mosaic(scenes, args.year, args.out)
        cut_tiles(mosaic, args.year, args.out)
    except NotImplementedError as e:
        print(f'[шаблон] {e}')
        return 0
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
