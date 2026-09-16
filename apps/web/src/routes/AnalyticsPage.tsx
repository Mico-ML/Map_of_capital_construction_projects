import {
  Box,
  Container,
  Grid,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { STATUS_GROUPS, formatAreaM2, formatNumberRu, type StatusGroupCode } from '@oks/shared';
import { useAnalyticsRisks, useAnalyticsSummary } from '../hooks/useApi';
import { DemoBadge } from '../components/common/Badges';

const GROUP_LABEL: Record<StatusGroupCode, string> = {
  design: 'Проектирование',
  construction: 'Строительство',
  procurement: 'Закупки',
  completed: 'Завершено',
};

/**
 * Лёгкие inline-SVG графики (без тяжёлых библиотек): меньше размер бандла и выше
 * производительность сборки/LCP (§9). Данные — из /analytics/summary.
 */
function BarChart({ data }: { data: { label: string; value: number; color?: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barW = 46;
  const gap = 18;
  const h = 200;
  const w = data.length * (barW + gap) + gap;
  return (
    <Box sx={{ width: '100%', overflowX: 'auto' }}>
      <svg width={w} height={h + 34} role="img" aria-label="Динамика ввода по годам">
        {data.map((d, i) => {
          const bh = (d.value / max) * h;
          const x = gap + i * (barW + gap);
          const y = h - bh;
          return (
            <g key={d.label}>
              <rect x={x} y={y} width={barW} height={bh} rx={4} fill={d.color ?? '#2E7D32'} />
              <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize={13} fontWeight={700} fill="#333">
                {d.value}
              </text>
              <text x={x + barW / 2} y={h + 20} textAnchor="middle" fontSize={12} fill="#555">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </Box>
  );
}

function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = 70;
  const cx = 90;
  const cy = 90;
  const stroke = 34;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  return (
    <Stack direction="row" spacing={2} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }} useFlexGap>
      <svg width={180} height={180} role="img" aria-label="Объекты по группам статусов">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eee" strokeWidth={stroke} />
        {data.map((d) => {
          const len = (d.value / total) * circumference;
          const el = (
            <circle
              key={d.label}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${circumference - len}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
          offset += len;
          return el;
        })}
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize={22} fontWeight={800} fill="#333">
          {total}
        </text>
      </svg>
      <Stack spacing={0.5}>
        {data.map((d) => (
          <Stack key={d.label} direction="row" spacing={1} alignItems="center">
            <Box sx={{ width: 14, height: 14, borderRadius: '3px', bgcolor: d.color }} />
            <Typography variant="body2">
              {d.label}: <strong>{d.value}</strong>
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}

/** Аналитический дашборд (§7 Ф9): распределения, динамика ввода, объекты риска. */
export function AnalyticsPage() {
  const { data, isLoading } = useAnalyticsSummary();
  const { data: risks } = useAnalyticsRisks();

  if (isLoading || !data) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Skeleton variant="rectangular" height={120} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={320} />
      </Container>
    );
  }

  const byGroup = (Object.keys(GROUP_LABEL) as StatusGroupCode[]).map((g) => ({
    label: GROUP_LABEL[g],
    value: data.byStatusGroup[g] ?? 0,
    color: STATUS_GROUPS[g].colorHex,
  }));
  const byYear = data.commissioningByYear.map((y) => ({ label: String(y.year), value: y.count }));

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h4">Аналитика отрасли</Typography>
        <DemoBadge label="закупки/обращения — демо" />
      </Stack>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <StatCard label="Всего объектов" value={formatNumberRu(data.totalObjects) ?? '—'} />
        <StatCard label="Введено в эксплуатацию" value={formatNumberRu(data.completedCount) ?? '—'} />
        <StatCard label="Активных (строятся/проект)" value={formatNumberRu(data.activeCount) ?? '—'} />
        <StatCard
          label="Средняя готовность активных"
          value={data.avgReadinessActive !== null ? `${data.avgReadinessActive}%` : '—'}
        />
        <StatCard label="Суммарная площадь" value={data.totalAreaM2 !== null ? formatAreaM2(data.totalAreaM2) ?? '—' : '—'} />
        <StatCard label="Без точного местоположения" value={formatNumberRu(data.withoutExactLocationCount) ?? '—'} />
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="subtitle1" gutterBottom>
              Динамика ввода в эксплуатацию по годам
            </Typography>
            {byYear.length > 0 ? (
              <BarChart data={byYear} />
            ) : (
              <Typography variant="body2" color="text.secondary">
                Нет данных о годах ввода.
              </Typography>
            )}
          </Paper>
        </Grid>
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="subtitle1" gutterBottom>
              Объекты по группам статусов
            </Typography>
            <DonutChart data={byGroup} />
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Топ отраслей
            </Typography>
            <Table size="small">
              <TableBody>
                {data.byIndustry.slice(0, 8).map((i) => (
                  <TableRow key={i.code}>
                    <TableCell>{i.name}</TableCell>
                    <TableCell align="right">{i.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Распределение по муниципальным образованиям
            </Typography>
            <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
              <Table size="small">
                <TableBody>
                  {data.byMunicipality.slice(0, 15).map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{m.name}</TableCell>
                      <TableCell align="right">{m.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          Объекты риска (срок контракта истёк при готовности &lt; 100%)
        </Typography>
        {risks && risks.length > 0 ? (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Объект</TableCell>
                <TableCell>МО</TableCell>
                <TableCell align="right">Готовность</TableCell>
                <TableCell>Срок контракта</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {risks.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.municipalityName ?? '—'}</TableCell>
                  <TableCell align="right">{r.readinessPct !== null ? `${r.readinessPct}%` : '—'}</TableCell>
                  <TableCell>{r.contractEndDate ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Объектов с истёкшим сроком контракта при незавершённой готовностью не выявлено.
          </Typography>
        )}
      </Paper>
    </Container>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Grid item xs={6} md={2}>
      <Paper sx={{ p: 1.5, height: '100%', textAlign: 'center' }}>
        <Typography variant="h5" color="primary" sx={{ fontWeight: 800 }}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      </Paper>
    </Grid>
  );
}
