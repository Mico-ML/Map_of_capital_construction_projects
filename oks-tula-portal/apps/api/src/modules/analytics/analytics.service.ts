import { Injectable } from '@nestjs/common';
import type { AnalyticsSummary, RiskObject, StatusGroupCode } from '@oks/shared';
import { PrismaService } from '../../common/prisma.service';
import { loadConfig, mockProviders } from '../../config/env';

interface GroupCount {
  code: string | null;
  name: string | null;
  group: string | null;
  count: number;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(): Promise<AnalyticsSummary> {
    const cfg = loadConfig(process.env);
    const [
      totalObjects,
      completedCount,
      statuses,
      industries,
      municipalities,
      years,
      areaAgg,
      readinessAgg,
      noGeom,
      dataActual,
    ] = await Promise.all([
      this.prisma.object.count(),
      this.prisma.object.count({ where: { status: { groupCode: 'completed' } } }),
      this.prisma.$queryRaw<GroupCount[]>`
        SELECT s.code, s.name, s.group_code AS "group", count(o.id)::int AS count
        FROM objects o LEFT JOIN statuses s ON s.id = o.status_id
        GROUP BY s.code, s.name, s.group_code ORDER BY count DESC`,
      this.prisma.$queryRaw<GroupCount[]>`
        SELECT i.code, i.name, NULL AS "group", count(o.id)::int AS count
        FROM objects o LEFT JOIN industries i ON i.id = o.industry_id
        GROUP BY i.code, i.name ORDER BY count DESC`,
      this.prisma.$queryRaw<GroupCount[]>`
        SELECT m.id AS code, m.name_short AS name, NULL AS "group", count(o.id)::int AS count
        FROM objects o LEFT JOIN municipalities m ON m.id = o.municipality_id
        GROUP BY m.id, m.name_short ORDER BY count DESC`,
      this.prisma.$queryRaw<{ year: number; count: number }[]>`
        SELECT commissioning_year AS year, count(*)::int AS count
        FROM objects WHERE commissioning_year IS NOT NULL
        GROUP BY commissioning_year ORDER BY commissioning_year`,
      this.prisma.$queryRaw<{ total: string | null }[]>`
        SELECT sum(area_m2)::text AS total FROM objects WHERE area_m2 IS NOT NULL`,
      this.prisma.$queryRaw<{ avg: string | null }[]>`
        SELECT avg(readiness_pct)::text AS avg FROM objects
        WHERE readiness_pct IS NOT NULL AND status_id IN
          (SELECT id FROM statuses WHERE group_code <> 'completed')`,
      this.prisma.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM objects WHERE geom IS NULL`,
      this.prisma.object.aggregate({ _max: { importedAt: true } }),
    ]);

    const byGroup: Record<StatusGroupCode, number> = {
      design: 0,
      construction: 0,
      procurement: 0,
      completed: 0,
    };
    for (const s of statuses) {
      if (s.group && s.group in byGroup) {
        byGroup[s.group as StatusGroupCode] += Number(s.count);
      }
    }

    const totalArea = areaAgg[0]?.total ? Number(areaAgg[0].total) : null;
    const avgReadiness = readinessAgg[0]?.avg ? Number(readinessAgg[0].avg) : null;

    return {
      totalObjects,
      byStatusGroup: byGroup,
      byStatus: statuses
        .filter((s) => s.code)
        .map((s) => ({
          code: s.code as string,
          name: s.name ?? 'не распознан',
          group: (s.group ?? 'completed') as StatusGroupCode,
          count: Number(s.count),
        })),
      byIndustry: industries
        .filter((i) => i.code)
        .map((i) => ({ code: i.code as string, name: i.name ?? 'не указана', count: Number(i.count) })),
      byMunicipality: municipalities
        .filter((m) => m.code)
        .map((m) => ({ id: m.code as string, name: m.name ?? '—', count: Number(m.count) })),
      commissioningByYear: years.map((y) => ({ year: y.year, count: Number(y.count) })),
      activeCount: totalObjects - completedCount,
      completedCount,
      totalAreaM2: totalArea !== null && Number.isFinite(totalArea) ? totalArea : null,
      avgReadinessActive:
        avgReadiness !== null && Number.isFinite(avgReadiness) ? Math.round(avgReadiness * 10) / 10 : null,
      withoutExactLocationCount: noGeom[0]?.count ?? 0,
      municipalitiesCovered: municipalities.filter((m) => m.code).length,
      dataActualDate: dataActual._max.importedAt
        ? new Date(dataActual._max.importedAt).toISOString().slice(0, 10)
        : null,
      isMockParts: mockProviders(cfg),
    };
  }

  /** Объекты риска: срок контракта истёк при готовности < 100 (Ф9). */
  async risks(): Promise<RiskObject[]> {
    const rows = await this.prisma.$queryRaw<
      { id: string; name: string; municipality: string | null; readiness: string | null; contract_end: string | null }[]
    >`
      SELECT o.id::text AS id, o.name, m.name_short AS municipality,
             o.readiness_pct::text AS readiness, o.contract_period_end::text AS contract_end
      FROM objects o
      LEFT JOIN municipalities m ON m.id = o.municipality_id
      JOIN statuses s ON s.id = o.status_id
      WHERE s.group_code <> 'completed'
        AND o.contract_period_end IS NOT NULL
        AND o.contract_period_end < CURRENT_DATE
        AND (o.readiness_pct IS NULL OR o.readiness_pct < 100)
      ORDER BY o.contract_period_end ASC
      LIMIT 200
    `;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      municipalityName: r.municipality,
      readinessPct: r.readiness ? Number(r.readiness) : null,
      contractEndDate: r.contract_end,
      riskFlags: ['contract_overdue'],
    }));
  }
}
