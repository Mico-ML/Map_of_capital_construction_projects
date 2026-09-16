import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  FormControlLabel,
  LinearProgress,
  Link,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import {
  ACCESSIBILITY_THRESHOLDS,
  DIRECTION_LABELS,
  ISOCHRONE_PRESETS,
  formatNumberRu,
  m2ToKm2,
  pluralRu,
  zoneStyle,
  type AccessibilityItem,
  type AccessibilityReport,
  type AccessibilityVerdict,
  type IsochroneResult,
} from '@oks/shared';
import { useAccessibilityReport, useObjectIsochrone } from '../../hooks/useApi';
import { useUiStore } from '../../store/ui';
import { DemoBadge, NoData } from '../common/Badges';
import { IsochroneMiniMap } from './IsochroneMiniMap';

interface Props {
  objectId: string;
  /** Есть ли точная координата в реестре (иначе — только приближённая геометрия). */
  hasExactPoint: boolean;
  municipalityName: string | null;
  /** Показать кнопку «центрировать карту» (на странице карты). */
  onFocusMap?: (nonce: number) => void;
}

/**
 * Вкладка «Доступность» карточки объекта (§7 Ф4):
 * зона пешей доступности 5/10/15/20 минут, переключатель направления
 * («от объекта» / «к объекту» — reverse), отчёт доступности с населением, POI,
 * объектами той же сферы и вердиктом + обязательные дисклеймеры.
 */
export function AccessibilityPanel({ objectId, hasExactPoint, municipalityName, onFocusMap }: Props) {
  const durations = useUiStore((s) => s.isoDurations);
  const reverse = useUiStore((s) => s.isoReverse);
  const allowApproximate = useUiStore((s) => s.isoApproximate);
  const visible = useUiStore((s) => s.isoVisible);
  const toggleDuration = useUiStore((s) => s.toggleIsoDuration);
  const setReverse = useUiStore((s) => s.setIsoReverse);
  const setApproximate = useUiStore((s) => s.setIsoApproximate);
  const setVisible = useUiStore((s) => s.setIsoVisible);

  const [methodOpen, setMethodOpen] = useState(false);
  const [focusNonce, setFocusNonce] = useState(0);

  const enabled = visible && durations.length > 0;
  const isoQuery = { objectId, durations, reverse, allowApproximate, enabled };
  const { data: iso, isFetching, isError, refetch } = useObjectIsochrone(isoQuery);
  const reportDuration = durations.length > 0 ? Math.max(...durations) : 900;
  const { data: report, isFetching: reportFetching } = useAccessibilityReport({
    ...isoQuery,
    durations: [reportDuration],
    enabled,
  });

  const focusMap = () => {
    const next = focusNonce + 1;
    setFocusNonce(next);
    onFocusMap?.(next);
  };

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }} useFlexGap>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Зона пешей доступности
        </Typography>
        {iso?.isMock && <DemoBadge label="ДЕМО-ДАННЫЕ: геометрическая модель" />}
        {!iso?.isMock && iso?.available && <Chip size="small" color="success" variant="outlined" label="2ГИС Isochrone API" />}
      </Stack>

      <ToggleButtonGroup
        size="small"
        value={durations}
        onChange={(_, value: number[]) => {
          // MUI отдаёт полный новый набор; переключаем по одному значению для учёта лимита 5 (§4.2)
          const added = value.filter((v) => !durations.includes(v));
          const removed = durations.filter((v) => !value.includes(v));
          for (const v of [...removed, ...added]) toggleDuration(v);
        }}
        aria-label="Время в пути"
        sx={{ mb: 1, flexWrap: 'wrap' }}
      >
        {ISOCHRONE_PRESETS.map((p) => (
          <ToggleButton key={p.durationSec} value={p.durationSec} aria-label={p.label}>
            {p.short}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <ToggleButtonGroup
        size="small"
        exclusive
        value={reverse ? 'to' : 'from'}
        onChange={(_, v) => v && setReverse(v === 'to')}
        aria-label="Направление расчёта"
        sx={{ mb: 1, display: 'flex' }}
      >
        <ToggleButton value="from" aria-label="От объекта" sx={{ flex: 1 }}>
          <Tooltip title={DIRECTION_LABELS.from.hint}>
            <span>От объекта</span>
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="to" aria-label="К объекту" sx={{ flex: 1 }}>
          <Tooltip title={DIRECTION_LABELS.to.hint}>
            <span>К объекту</span>
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      {!hasExactPoint && (
        <Alert severity="warning" icon={false} sx={{ mb: 1 }}>
          <Typography variant="caption" component="div">
            У объекта нет точного местоположения в реестре. Расчёт от центроида МО — приближённая оценка
            (§6.3 п.7), требуется явное согласие:
          </Typography>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={allowApproximate}
                onChange={(e) => setApproximate(e.target.checked)}
                inputProps={{ 'aria-label': 'Разрешить приближённую геометрию (центроид МО)' }}
              />
            }
            label={<Typography variant="body2">Приближённая геометрия (центроид МО)</Typography>}
          />
        </Alert>
      )}

      <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }} useFlexGap>
        <Button
          size="small"
          variant={visible ? 'outlined' : 'contained'}
          onClick={() => setVisible(!visible)}
          startIcon={<MyLocationIcon />}
        >
          {visible ? 'Скрыть зону' : 'Показать зону'}
        </Button>
        <Button size="small" variant="text" startIcon={<RefreshIcon />} onClick={() => void refetch()} disabled={!visible}>
          Пересчитать
        </Button>
        {visible && iso?.available && (
          <Button size="small" variant="text" onClick={focusMap}>
            Центрировать карту
          </Button>
        )}
      </Stack>

      {(isFetching || reportFetching) && (
        <Box sx={{ mb: 1 }}>
          <LinearProgress aria-label="Расчёт зоны доступности" />
          <Typography variant="caption" color="text.secondary">
            Расчёт зоны пешей доступности… При первом обращении выполняется запрос к Isochrone API 2ГИС
            (таймаут 15 с), повторные обращения берутся из кэша PostgreSQL/PostGIS (§4.2).
          </Typography>
        </Box>
      )}

      {durations.length === 0 && (
        <Alert severity="info" icon={false} sx={{ mb: 1 }}>
          Выберите время в пути (5/10/15/20 минут), чтобы построить зону.
        </Alert>
      )}

      {isError && (
        <Alert severity="error" icon={false} sx={{ mb: 1 }}>
          Не удалось получить зону доступности. Проверьте доступность API и повторите попытку.
        </Alert>
      )}

      {iso && !iso.available && iso.unavailableReason && <UnavailableReason iso={iso} />}

      {iso && iso.available && iso.zones.length > 0 && (
        <>
          <Stack spacing={0.5} sx={{ mb: 1 }}>
            {iso.zones.map((zone) => (
              <Stack key={zone.durationSec} direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                <Chip
                  size="small"
                  label={zone.durationLabel}
                  sx={{
                    bgcolor: zone.isMock ? '#ECEFF1' : undefined,
                    border: `2px solid ${zoneStyle(zone.durationSec).stroke}`,
                    fontWeight: 700,
                  }}
                />
                <Typography variant="body2">
                  {zone.areaM2 !== null ? `${formatNumberRu(m2ToKm2(zone.areaM2) ?? 0, 3)} км²` : <NoData inline />}
                </Typography>
                <ZoneSourceChip zone={zone} />
              </Stack>
            ))}
          </Stack>

          {iso.locationApproximate && (
            <Alert severity="info" icon={false} sx={{ mb: 1 }}>
              <Typography variant="caption">{iso.note}</Typography>
            </Alert>
          )}

          <Box sx={{ mb: 1 }}>
            <IsochroneMiniMap
              center={iso.startPoint}
              zones={iso.zones}
              markers={(report?.sameSphere.inside ?? []).flatMap((item) =>
                item.point ? [{ point: item.point, label: item.name, inside: true }] : [],
              )}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Красные точки — объекты той же сферы из реестра ОКС внутри зоны. Картооснова — 2ГИС.
            </Typography>
          </Box>

          {report && <ReportBlock report={report} methodOpen={methodOpen} setMethodOpen={setMethodOpen} />}

          <Alert severity="info" icon={false} sx={{ mt: 1 }}>
            <Typography variant="caption">{iso.disclaimer}</Typography>
          </Alert>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            Кэш зон: {new Date(iso.zones[0].expiresAt).toLocaleDateString('ru-RU')} (TTL 30 суток).
            Маршруты «от двери до двери» не рассчитываются: Routing API 2ГИС на текущей подписке недоступен
            (§4.6, HTTP 418) — расстояния приведены по прямой.
          </Typography>
        </>
      )}

      {municipalityName && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Муниципальное образование: {municipalityName}.
        </Typography>
      )}
    </Box>
  );
}

/** Причина недоступности зон — честно, без имитации геометрии (§15.1). */
function UnavailableReason({ iso }: { iso: IsochroneResult }) {
  const map: Record<string, { severity: 'warning' | 'error' | 'info'; text: string }> = {
    no_geometry: {
      severity: 'warning',
      text:
        'У объекта нет точного местоположения, поэтому зона не рассчитывается (§6.3 п.7). ' +
        'Запросите координаты у заказчика или включите приближённую геометрию выше.',
    },
    disabled: {
      severity: 'info',
      text:
        'Расчёт зон отключён в демо-режиме (ISOCHRONE_MOCK_GEOMETRY=false). ' +
        'Задайте ROUTING_API_KEY и ISOCHRONE_PROVIDER=live для расчёта по пешеходной сети 2ГИС.',
    },
    not_found: {
      severity: 'warning',
      text: 'Isochrone API не построил зону для этой точки (HTTP 204) — вероятно, точка вне пешеходной сети.',
    },
    quota: {
      severity: 'error',
      text: 'Превышена квота или ограничение частоты запросов 2ГИС. Повторите позже: результат кэшируется на 30 суток.',
    },
    provider_error: {
      severity: 'error',
      text: iso.note ?? 'Isochrone API 2ГИС вернул ошибку. Проверьте ROUTING_API_KEY и доступность сервиса.',
    },
  };
  const entry = map[iso.unavailableReason ?? 'provider_error'] ?? map.provider_error;
  return (
    <Alert severity={entry.severity} icon={false} sx={{ mb: 1 }}>
      <Typography variant="caption">{entry.text}</Typography>
    </Alert>
  );
}

function ZoneSourceChip({ zone }: { zone: IsochroneResult['zones'][number] }) {
  if (zone.isMock) {
    return (
      <Tooltip title="Демо-модель: радиус = время × скорость пешехода. Не является расчётом по пешеходной сети 2ГИС.">
        <Chip size="small" variant="outlined" label="демо-модель" sx={{ height: 20, fontSize: 11 }} />
      </Tooltip>
    );
  }
  return (
    <Tooltip
      title={
        zone.source === 'cache'
          ? `Результат из кэша PostGIS (построен ${new Date(zone.generatedAt).toLocaleString('ru-RU')}). Повторный запрос к API не выполнялся (§4.2).`
          : 'Свежий расчёт Isochrone API 2ГИС; результат сохранён в кэш на 30 суток.'
      }
    >
      <Chip
        size="small"
        variant="outlined"
        color={zone.source === 'cache' ? 'default' : 'success'}
        label={zone.source === 'cache' ? 'из кэша' : 'новый расчёт'}
        sx={{ height: 20, fontSize: 11 }}
      />
    </Tooltip>
  );
}

function ReportBlock({
  report,
  methodOpen,
  setMethodOpen,
}: {
  report: AccessibilityReport;
  methodOpen: boolean;
  setMethodOpen: (open: boolean) => void;
}) {
  const severity = verdictSeverity(report.verdict.code);
  const poiRows = report.poi.filter((g) => g.sphere !== 'residential');
  return (
    <Box>
      <Divider sx={{ my: 1 }} />
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
        Отчёт доступности ({report.zone ? report.zone.durationLabel : '—'})
      </Typography>

      <Alert severity={severity} icon={false} sx={{ mb: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {report.verdict.title}
        </Typography>
        <Typography variant="caption" component="div">
          {report.verdict.explanation}
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', rowGap: 0.5 }} useFlexGap>
          {report.verdict.basis.map((b, i) => (
            <Chip key={i} size="small" variant="outlined" label={b} sx={{ height: 20, fontSize: 11, maxWidth: '100%' }} />
          ))}
          <Chip
            size="small"
            label={`достоверность: ${confidenceLabel(report.verdict.confidence)}`}
            sx={{ height: 20, fontSize: 11 }}
          />
        </Stack>
      </Alert>

      <Button size="small" onClick={() => setMethodOpen(!methodOpen)} aria-expanded={methodOpen}>
        {methodOpen ? 'Скрыть методику' : 'Как это считается (методика)'}
      </Button>
      <Collapse in={methodOpen}>
        <Box component="ul" sx={{ pl: 2.5, mt: 0.5, mb: 1 }}>
          {report.methodology.map((line, i) => (
            <Typography key={i} component="li" variant="caption" color="text.secondary">
              {line}
            </Typography>
          ))}
        </Box>
      </Collapse>

      <Table size="small" aria-label="Показатели доступности">
        <TableBody>
          <MetricRow
            label="Площадь зоны"
            value={report.zoneAreaKm2 !== null ? `${formatNumberRu(report.zoneAreaKm2, 3)} км²` : null}
            hint="PostGIS ST_Area по географической проекции"
          />
          <MetricRow
            label="Жителей в зоне"
            value={report.population.value !== null ? pluralRu(report.population.value, ['человек', 'человека', 'человек']) : null}
            hint={report.population.method}
            source={report.population.source}
            isMock={report.population.isMock}
          />
          <MetricRow
            label="Жилых домов в зоне"
            value={report.residentialBuildings.value !== null ? pluralRu(report.residentialBuildings.value, ['дом', 'дома', 'домов']) : null}
            hint={report.residentialBuildings.method}
            source={report.residentialBuildings.source}
            isMock={report.residentialBuildings.isMock}
            gapNote={
              report.residentialBuildings.value === null
                ? 'Требуется CATALOG_API_KEY (Search API 2ГИС): данные о зданиях не выдумываются.'
                : null
            }
          />
        </TableBody>
      </Table>

      <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mt: 1 }}>
        POI внутри зоны (2ГИС Search API)
      </Typography>
      <Table size="small" aria-label="POI внутри зоны">
        <TableHead>
          <TableRow>
            <TableCell sx={{ py: 0.5 }}>Сфера</TableCell>
            <TableCell align="right" sx={{ py: 0.5 }}>
              Объектов
            </TableCell>
            <TableCell sx={{ py: 0.5 }}>Чем считалось</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {poiRows.length === 0 && (
            <TableRow>
              <TableCell colSpan={3}>
                <NoData />
              </TableCell>
            </TableRow>
          )}
          {poiRows.map((g) => (
            <TableRow key={g.sphere}>
              <TableCell sx={{ py: 0.5 }}>{g.label}</TableCell>
              <TableCell align="right" sx={{ py: 0.5 }}>
                {g.count === null ? <NoData inline /> : formatNumberRu(g.count)}
              </TableCell>
              <TableCell sx={{ py: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  {g.count === null && g.gapReason === 'provider_mock'
                    ? 'демо-режим: CATALOG_API_KEY не задан'
                    : g.matchedBy.join('; ') || g.source}
                </Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mt: 1 }}>
        Объекты той же сферы (реестр ОКС — реальные данные)
      </Typography>
      {report.sameSphere.inside.length === 0 && report.sameSphere.nearest.length === 0 ? (
        <Typography variant="caption" color="text.secondary">
          В реестре ОКС нет других объектов этой сферы с точными координатами поблизости. Реестр описывает объекты
          капитального строительства, а не всю сеть социальной инфраструктуры — полная картина появится с POI 2ГИС
          (боевой режим) и индексом обеспеченности МО (Ф5).
        </Typography>
      ) : (
        <Stack spacing={0.5} sx={{ mt: 0.5 }}>
          {report.sameSphere.inside.map((item) => (
            <PeerRow key={item.id} item={item} tag="в зоне" color="#D32F2F" />
          ))}
          {report.sameSphere.nearest.map((item) => (
            <PeerRow key={item.id} item={item} tag="вне зоны" color="#455A64" />
          ))}
        </Stack>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        Порог «дублирования» — {ACCESSIBILITY_THRESHOLDS.peerDuplicateM} м, «закрывает дефицит» —{' '}
        {ACCESSIBILITY_THRESHOLDS.peerFarM} м и более (config/isochrone.ts, требует утверждения заказчиком).
        Расстояния — по прямой, время — оценка (1,1 м/с).
      </Typography>
    </Box>
  );
}

function PeerRow({ item, tag, color }: { item: AccessibilityItem; tag: string; color: string }) {
  return (
    <Stack direction="row" spacing={1} alignItems="baseline" sx={{ flexWrap: 'wrap' }}>
      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} aria-hidden />
      <Typography variant="body2" sx={{ flex: 1, minWidth: 160 }}>
        {item.registryObjectId ? (
          <Link href={`/objects/${item.registryObjectId}`} underline="hover">
            {item.name}
          </Link>
        ) : (
          item.name
        )}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {tag} · {item.distanceM !== null ? `${formatNumberRu(item.distanceM)} м` : '—'}
        {item.walkMinutes !== null ? ` (~${formatNumberRu(item.walkMinutes, 0)} мин пешком по прямой)` : ''}
        {item.statusName ? ` · ${item.statusName}` : ''}
      </Typography>
    </Stack>
  );
}

function MetricRow({
  label,
  value,
  hint,
  source,
  isMock,
  gapNote,
}: {
  label: string;
  value: string | null;
  hint?: string;
  source?: string;
  isMock?: boolean;
  gapNote?: string | null;
}) {
  return (
    <TableRow sx={{ '& td': { border: 0, py: 0.5, verticalAlign: 'top' } }}>
      <TableCell sx={{ color: 'text.secondary', width: '42%', pr: 1 }}>
        {label}
        {hint && (
          <Tooltip title={hint}>
            <Typography component="span" variant="caption" sx={{ ml: 0.5, cursor: 'help' }} aria-label="Как считается">
              ⓘ
            </Typography>
          </Tooltip>
        )}
      </TableCell>
      <TableCell>
        {value === null ? (
          <Stack spacing={0.25}>
            <NoData inline />
            {gapNote && (
              <Typography variant="caption" color="text.secondary">
                {gapNote}
              </Typography>
            )}
          </Stack>
        ) : (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {value}
            </Typography>
            {isMock && <DemoBadge label="демо-население" />}
          </Stack>
        )}
        {value !== null && source && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Источник: {source}
          </Typography>
        )}
      </TableCell>
    </TableRow>
  );
}

function verdictSeverity(code: AccessibilityVerdict['code']): 'success' | 'warning' | 'info' {
  if (code === 'closes_deficit') return 'success';
  if (code === 'duplicates') return 'warning';
  return 'info';
}

function confidenceLabel(confidence: AccessibilityVerdict['confidence']): string {
  if (confidence === 'high') return 'высокая (данные 2ГИС)';
  if (confidence === 'medium') return 'средняя (часть данных демо)';
  return 'низкая (демо-модель зоны)';
}

/** Индикатор загрузки для ленивых блоков. */
export function AccessibilityLoading() {
  return (
    <Box sx={{ p: 2, display: 'grid', placeItems: 'center' }}>
      <CircularProgress size={22} aria-label="Загрузка отчёта доступности" />
    </Box>
  );
}
