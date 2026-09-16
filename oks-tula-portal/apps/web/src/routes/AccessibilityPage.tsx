import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DIRECTION_LABELS,
  INDUSTRIES,
  ISOCHRONE_PRESETS,
  MUNICIPALITIES,
  SPHERES,
  formatNumberRu,
  pluralRu,
  type CoverageMunicipalityRow,
  type IsochroneDirection,
  type SphereCode,
} from '@oks/shared';
import { api } from '../lib/api-client';
import { useCoverage, useIsochroneStatus, useObjects } from '../hooks/useApi';
import { MapView } from '../components/map/MapView';
import { DemoBadge } from '../components/common/Badges';

type SortKey = 'name' | 'coveredPct' | 'uncoveredKm2' | 'populationCovered';

/**
 * Пакетный режим Ф4 (§7): построение изохрон для всех объектов отрасли/МО,
 * сводная карта покрытия территории и «белые пятна» — зоны области,
 * не покрытые пешей доступностью объектов сферы.
 *
 * Честность данных: покрытие и «белые пятна» считаются только по реально
 * построенным зонам (кэш PostGIS). Если зон нет — показываем «Нет данных»
 * и инструкцию, а не имитируем покрытие (§15.1).
 */
export function AccessibilityPage() {
  const queryClient = useQueryClient();
  const { data: status } = useIsochroneStatus();

  const [sphere, setSphere] = useState<SphereCode | ''>('education');
  const [municipality, setMunicipality] = useState<string>('');
  const [durationSec, setDurationSec] = useState<number>(900);
  const [direction, setDirection] = useState<IsochroneDirection>('to');
  const [allowApproximate, setAllowApproximate] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'coveredPct', dir: 'asc' });

  const industryCodes = useMemo(
    () => (sphere ? INDUSTRIES.filter((i) => i.sphere === sphere).map((i) => i.code) : []),
    [sphere],
  );

  const coverageQuery = {
    sphere: sphere || null,
    industry: industryCodes,
    municipality: municipality ? [municipality] : [],
    durationSec,
    reverse: direction === 'to',
    allowApproximate,
  };
  const { data: coverage, isFetching: coverageFetching } = useCoverage(coverageQuery);

  // Объекты выборки — на карте вместе с покрытием
  const { data: objectsData } = useObjects({
    industry: industryCodes.length ? industryCodes : undefined,
    municipality: municipality ? [municipality] : undefined,
    limit: 200,
  });

  const batch = useMutation({
    mutationFn: () =>
      api.isochroneBatch({
        sphere: sphere || undefined,
        industry: industryCodes.length ? industryCodes.join(',') : undefined,
        municipality: municipality || undefined,
        durations: String(durationSec),
        reverse: direction === 'to' ? 'true' : 'false',
        allowApproximate: allowApproximate ? 'true' : 'false',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['isochrone', 'coverage'] });
      void queryClient.invalidateQueries({ queryKey: ['isochrone', 'status'] });
    },
  });

  const rows = sortRows(coverage?.municipalities ?? [], sort);
  const isMock = Boolean(coverage?.isMock || status?.syntheticGeometry);

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1, mb: 1 }} useFlexGap>
        <Typography variant="h5" component="h1">
          Пешая доступность: покрытие и «белые пятна»
        </Typography>
        {isMock && <DemoBadge label="ДЕМО-ДАННЫЕ: зоны построены моделью" />}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 960 }}>
        Пакетный режим для аналитиков (§7 Ф4): изохроны строятся для всех объектов выбранной сферы/отрасли и МО,
        затем в PostGIS считается объединение зон (покрытие) и разница с границами МО («белые пятна» — территории
        вне пешей доступности объектов сферы). Результат кэшируется на 30 суток: повторный расчёт не обращается к API.
      </Typography>

      <Paper sx={{ p: 1.5, mb: 2 }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="sphere-label">Сфера</InputLabel>
              <Select
                labelId="sphere-label"
                label="Сфера"
                value={sphere}
                onChange={(e) => setSphere(e.target.value as SphereCode | '')}
              >
                <MenuItem value="">
                  <em>Все отрасли</em>
                </MenuItem>
                {SPHERES.map((s) => (
                  <MenuItem key={s.code} value={s.code}>
                    {s.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="muni-label">Муниципальное образование</InputLabel>
              <Select
                labelId="muni-label"
                label="Муниципальное образование"
                value={municipality}
                onChange={(e) => setMunicipality(e.target.value)}
              >
                <MenuItem value="">
                  <em>Вся область</em>
                </MenuItem>
                {MUNICIPALITIES.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.nameShort}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel id="duration-label">Время в пути</InputLabel>
              <Select
                labelId="duration-label"
                label="Время в пути"
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value))}
              >
                {ISOCHRONE_PRESETS.map((p) => (
                  <MenuItem key={p.durationSec} value={p.durationSec}>
                    {p.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={direction}
              onChange={(_, v) => v && setDirection(v as IsochroneDirection)}
              aria-label="Направление расчёта"
              sx={{ display: 'flex' }}
            >
              <ToggleButton value="from" sx={{ flex: 1 }} aria-label="От объекта">
                <Tooltip title={DIRECTION_LABELS.from.hint}>
                  <span>От объекта</span>
                </Tooltip>
              </ToggleButton>
              <ToggleButton value="to" sx={{ flex: 1 }} aria-label="К объекту">
                <Tooltip title={DIRECTION_LABELS.to.hint}>
                  <span>К объекту</span>
                </Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>
          </Grid>
          <Grid item xs={12} md={2}>
            <Button
              fullWidth
              variant="contained"
              startIcon={batch.isPending ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
              onClick={() => batch.mutate()}
              disabled={batch.isPending}
            >
              Построить изохроны
            </Button>
          </Grid>
        </Grid>

        <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.5 }} useFlexGap>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={allowApproximate}
                onChange={(e) => setAllowApproximate(e.target.checked)}
                inputProps={{ 'aria-label': 'Включать объекты без точной геометрии (центроид МО)' }}
              />
            }
            label={
              <Typography variant="body2">
                Включать объекты без точного местоположения (центроид МО) — приближённая оценка
              </Typography>
            }
          />
          <Typography variant="caption" color="text.secondary">
            Провайдер: изохроны — {status?.isochroneProvider ?? '…'}, POI — {status?.poiProvider ?? '…'}; в кэше зон:{' '}
            {status?.cachedZones ?? '…'}
          </Typography>
        </Stack>

        {batch.isPending && <LinearProgress sx={{ mt: 1 }} aria-label="Пакетное построение изохрон" />}
        {batch.data && (
          <Alert severity="info" icon={false} sx={{ mt: 1 }}>
            <Typography variant="caption">
              Построено: {batch.data.built} · из кэша: {batch.data.fromCache} · ошибок: {batch.data.failed} · без
              геометрии: {batch.data.skippedNoGeometry}. {batch.data.note ?? ''}
            </Typography>
          </Alert>
        )}
        {batch.isError && (
          <Alert severity="error" icon={false} sx={{ mt: 1 }}>
            <Typography variant="caption">
              Не удалось построить изохроны: {batch.error instanceof Error ? batch.error.message : 'ошибка API'}
            </Typography>
          </Alert>
        )}
      </Paper>

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <SummaryCard
          title="Покрыто территории"
          value={coverage?.hasData && coverage.totals.coveredKm2 !== null ? `${formatNumberRu(coverage.totals.coveredKm2, 1)} км²` : null}
          hint={
            coverage?.totals.coveredPct != null
              ? `${formatNumberRu(coverage.totals.coveredPct, 2)} % от площади МО (${formatNumberRu(coverage.totals.areaKm2, 0)} км²)`
              : 'Площадь объединения зон (ST_Union) в границах МО'
          }
        />
        <SummaryCard
          title="Жителей в покрытии (оценка)"
          value={coverage?.hasData && coverage.totals.populationCovered !== null ? pluralRu(coverage.totals.populationCovered, ['человек', 'человека', 'человек']) : null}
          hint="Плотность населения МО × покрытая площадь; население — демо-данные (data/mock/population.csv)"
          isMock={isMock}
        />
        <SummaryCard
          title="Объектов в расчёте"
          value={coverage ? pluralRu(coverage.totals.objectsIncluded, ['объект', 'объекта', 'объектов']) : null}
          hint="Объекты выборки с точной геометрией, зоны которых есть в кэше"
        />
        <SummaryCard
          title="Без точного местоположения"
          value={coverage ? pluralRu(coverage.totals.objectsWithoutGeometry, ['объект', 'объекта', 'объектов']) : null}
          hint="Не участвуют в расчёте без явного согласия (§6.3 п.7) — см. переключатель выше"
          warning
        />
      </Grid>

      {!coverage?.hasData && (
        <Alert severity="warning" icon={false} sx={{ mb: 2 }}>
          <Typography variant="body2">
            {coverage?.note ??
              'Нет построенных зон под выбранный фильтр. Нажмите «Построить изохроны»: покрытие и «белые пятна» считаются только по реально рассчитанным зонам.'}
          </Typography>
        </Alert>
      )}

      <Box sx={{ position: 'relative', height: { xs: 320, md: 520 }, mb: 2, borderRadius: 1, overflow: 'hidden' }}>
        <MapView
          objects={objectsData?.items ?? []}
          selectedId={null}
          onSelect={() => undefined}
          coverageLayer={{ coverage: coverage?.coverage ?? null, whiteSpots: coverage?.whiteSpots ?? null }}
        />
        <Box sx={{ position: 'absolute', bottom: 12, left: 12, zIndex: 5 }}>
          <CoverageLegend hasCoverage={Boolean(coverage?.hasData)} isMock={isMock} />
        </Box>
        {coverageFetching && (
          <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 6 }}>
            <LinearProgress aria-label="Загрузка покрытия" />
          </Box>
        )}
      </Box>

      <Paper sx={{ p: 0, overflow: 'hidden' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, p: 1.5, pb: 0.5 }}>
          Покрытие по муниципальным образованиям
        </Typography>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label="Покрытие территории по МО">
            <TableHead>
              <TableRow>
                <SortCell label="МО" active={sort.key === 'name'} dir={sort.dir} onClick={() => toggleSort('name')} />
                <TableCell align="right">Площадь, км²</TableCell>
                <TableCell align="right">Объектов</TableCell>
                <SortCell
                  label="Покрыто, км²"
                  align="right"
                  active={sort.key === 'coveredPct'}
                  dir={sort.dir}
                  onClick={() => toggleSort('coveredPct')}
                />
                <TableCell align="right">Покрыто, %</TableCell>
                <SortCell
                  label="«Белые пятна», км²"
                  align="right"
                  active={sort.key === 'uncoveredKm2'}
                  dir={sort.dir}
                  onClick={() => toggleSort('uncoveredKm2')}
                />
                <SortCell
                  label="Жителей в покрытии"
                  align="right"
                  active={sort.key === 'populationCovered'}
                  dir={sort.dir}
                  onClick={() => toggleSort('populationCovered')}
                />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.municipalityId} hover>
                  <TableCell>
                    <Typography variant="body2">{row.municipalityName}</Typography>
                    {row.objectsWithoutGeometry > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        без геометрии: {row.objectsWithoutGeometry}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">{row.areaKm2 !== null ? formatNumberRu(row.areaKm2, 1) : '—'}</TableCell>
                  <TableCell align="right">{row.objectsIncluded}</TableCell>
                  <TableCell align="right">
                    {row.hasData && row.coveredKm2 !== null ? formatNumberRu(row.coveredKm2, 2) : 'нет данных'}
                  </TableCell>
                  <TableCell align="right">
                    {row.hasData && row.coveredPct !== null ? (
                      <Chip
                        size="small"
                        label={`${formatNumberRu(row.coveredPct, 1)} %`}
                        color={row.coveredPct < 1 ? 'warning' : 'default'}
                        variant={row.coveredPct < 1 ? 'filled' : 'outlined'}
                        sx={{ height: 20, fontSize: 11 }}
                      />
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {row.hasData && row.uncoveredKm2 !== null ? formatNumberRu(row.uncoveredKm2, 2) : '—'}
                  </TableCell>
                  <TableCell align="right">
                    {row.hasData && row.populationCovered !== null ? formatNumberRu(row.populationCovered) : '—'}
                    {row.populationCovered !== null && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        оценка{row.populationYear ? `, ${row.populationYear} г.` : ''}
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography variant="body2" color="text.secondary">
                      Нет данных: сначала постройте изохроны для выбранной сферы/МО.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </Paper>

      <Alert severity="info" icon={false} sx={{ mt: 2 }}>
        <Typography variant="caption">
          {coverage?.disclaimer ??
            'Расчёт по пешеходной сети 2ГИС, является оценкой. Демо-режим строит зоны геометрической моделью — такие результаты помечены и не используются для принятия решений.'}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div">
          Методика: ST_Union зон → ST_Intersection с границей МО (покрыто), ST_Difference (белые пятна), ST_Area по
          geography; упрощение геометрии ST_SimplifyPreserveTopology(0.0008) для отрисовки. Население в покрытии —
          плотность МО × покрытая площадь (демо-население). Границы МО — OpenStreetMap (ODbL).
        </Typography>
      </Alert>
    </Container>
  );

  function toggleSort(key: SortKey) {
    setSort((prev) => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));
  }
}

function SummaryCard({
  title,
  value,
  hint,
  isMock,
  warning,
}: {
  title: string;
  value: string | null;
  hint: string;
  isMock?: boolean;
  warning?: boolean;
}) {
  return (
    <Grid item xs={12} sm={6} md={3}>
      <Card variant="outlined" sx={{ height: '100%' }}>
        <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Typography variant="caption" color="text.secondary">
              {title}
            </Typography>
            {isMock && <DemoBadge label="демо" />}
          </Stack>
          <Typography variant="h6" sx={{ fontWeight: 700, color: warning ? 'warning.dark' : 'text.primary' }}>
            {value ?? <Typography component="span" variant="h6" color="text.disabled">Нет данных</Typography>}
          </Typography>
          <Tooltip title={hint}>
            <Typography variant="caption" color="text.secondary" sx={{ cursor: 'help', display: 'block' }}>
              {hint.length > 90 ? `${hint.slice(0, 90)}…` : hint}
            </Typography>
          </Tooltip>
        </CardContent>
      </Card>
    </Grid>
  );
}

function SortCell({
  label,
  active,
  dir,
  onClick,
  align,
}: {
  label: string;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
  align?: 'right';
}) {
  return (
    <TableCell align={align} sortDirection={active ? dir : false}>
      <TableSortLabel active={active} direction={active ? dir : 'asc'} onClick={onClick}>
        {label}
      </TableSortLabel>
    </TableCell>
  );
}

function CoverageLegend({ hasCoverage, isMock }: { hasCoverage: boolean; isMock: boolean }) {
  return (
    <Paper sx={{ p: 1, fontSize: 12, maxWidth: 240 }} elevation={3}>
      <Typography variant="caption" sx={{ fontWeight: 700 }}>
        Покрытие пешей доступностью
      </Typography>
      <Stack spacing={0.25} sx={{ mt: 0.5 }}>
        <LegendRow color="#2E7D32" label="покрыто зоной" />
        <LegendRow color="#D32F2F" label="«белое пятно»" dashed />
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        {hasCoverage
          ? isMock
            ? 'ДЕМО-МОДЕЛЬ зон: не пешеходная сеть 2ГИС'
            : 'Расчёт по пешеходной сети 2ГИС'
          : 'Нет построенных зон — слой пуст'}
      </Typography>
    </Paper>
  );
}

function LegendRow({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Box sx={{ width: 14, height: 14, borderRadius: '3px', bgcolor: `${color}40`, border: `2px ${dashed ? 'dashed' : 'solid'} ${color}` }} />
      <Typography variant="caption">{label}</Typography>
    </Stack>
  );
}

function sortRows(rows: CoverageMunicipalityRow[], sort: { key: SortKey; dir: 'asc' | 'desc' }): CoverageMunicipalityRow[] {
  const factor = sort.dir === 'asc' ? 1 : -1;
  const value = (r: CoverageMunicipalityRow): number | string => {
    switch (sort.key) {
      case 'name':
        return r.municipalityName;
      case 'uncoveredKm2':
        return r.uncoveredKm2 ?? -1;
      case 'populationCovered':
        return r.populationCovered ?? -1;
      case 'coveredPct':
      default:
        return r.coveredPct ?? -1;
    }
  };
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (typeof va === 'string' || typeof vb === 'string') {
      return String(va).localeCompare(String(vb), 'ru') * factor;
    }
    return (va - vb) * factor;
  });
}
