import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma.service';

interface MunicipalityGeoRow {
  fc: unknown;
}

@ApiTags('Муниципальные образования')
@Controller('municipalities')
export class MunicipalitiesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Список МО с центроидой, площадью и населением' })
  async list() {
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        name_short: string;
        name_full: string;
        oktmo: string | null;
        type: string;
        population: number | null;
        population_year: number | null;
        population_source: string | null;
        area_km2: string | null;
        density_per_km2: string | null;
        center_json: string | null;
      }[]
    >`
      SELECT id, name_short, name_full, oktmo, type, population, population_year,
             population_source, area_km2::text, density_per_km2::text,
             ST_AsGeoJSON(center) AS center_json
      FROM municipalities
      ORDER BY name_short
    `;
    return rows.map((r) => ({
      id: r.id,
      nameShort: r.name_short,
      nameFull: r.name_full,
      oktmo: r.oktmo,
      type: r.type,
      population: r.population,
      populationYear: r.population_year,
      populationSource: r.population_source,
      areaKm2: r.area_km2 ? Number(r.area_km2) : null,
      densityPerKm2: r.density_per_km2 ? Number(r.density_per_km2) : null,
      center: parsePoint(r.center_json),
    }));
  }

  @Get('geojson')
  @ApiOperation({ summary: 'FeatureCollection границ МО (для хороплета, Ф5)' })
  async geojson(): Promise<unknown> {
    const row = await this.prisma.$queryRaw<MunicipalityGeoRow[]>`
      SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(
          json_build_object(
            'type', 'Feature',
            'id', m.id,
            'properties', json_build_object(
              'id', m.id, 'name', m.name_short, 'nameFull', m.name_full,
              'population', m.population, 'areaKm2', m.area_km2,
              'geomIsMock', m.geom_is_mock
            ),
            'geometry', ST_AsGeoJSON(m.geom)::json
          )
        ), '[]'::json)
      ) AS fc
      FROM municipalities m
      WHERE m.geom IS NOT NULL
    `;
    return row[0]?.fc ?? { type: 'FeatureCollection', features: [] };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Карточка МО' })
  async get(@Param('id') id: string) {
    const m = await this.prisma.municipality.findUnique({ where: { id } });
    if (!m) throw new NotFoundException(`МО ${id} не найдено`);
    return {
      id: m.id,
      nameShort: m.nameShort,
      nameFull: m.nameFull,
      oktmo: m.oktmo,
      type: m.type,
      adminCenter: m.adminCenter,
      population: m.population,
      populationYear: m.populationYear,
      populationSource: m.populationSource,
      areaKm2: m.areaKm2 ? Number(m.areaKm2) : null,
      densityPerKm2: m.densityPerKm2 ? Number(m.densityPerKm2) : null,
    };
  }
}

function parsePoint(json: string | null): [number, number] | null {
  if (!json) return null;
  try {
    const p = JSON.parse(json) as { coordinates?: number[] };
    return p.coordinates ? [p.coordinates[0], p.coordinates[1]] : null;
  } catch {
    return null;
  }
}
