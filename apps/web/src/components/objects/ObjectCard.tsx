import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ShareIcon from '@mui/icons-material/Share';
import { CAPACITY_UNITS, formatAreaM2, formatDateRu, formatDateRangeRu, formatNumberRu, formatPercent } from '@oks/shared';
import type { ObjectDetails } from '@oks/shared';
import { useObject, useObjectContracts, useObjectAppeals } from '../../hooks/useApi';
import { useUiStore } from '../../store/ui';
import { StatusBadge } from './StatusBadge';
import { MediaViewer } from '../media/MediaViewer';
import { AccessibilityPanel } from '../isochrone/AccessibilityPanel';
import { ApproximateLocationBadge, DemoBadge, NoData } from '../common/Badges';

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  const isEmpty = children === null || children === undefined || children === '';
  return (
    <TableRow sx={{ '& td': { border: 0, py: 0.75, verticalAlign: 'top' } }}>
      <TableCell sx={{ color: 'text.secondary', width: '45%', pr: 2 }}>
        {label}
        {hint && (
          <Tooltip title={hint}>
            <Typography component="span" variant="caption" sx={{ ml: 0.5, cursor: 'help' }} aria-label="Как считается">
              ⓘ
            </Typography>
          </Tooltip>
        )}
      </TableCell>
      <TableCell sx={{ fontWeight: 500 }}>{isEmpty ? <NoData inline /> : children}</TableCell>
    </TableRow>
  );
}

function capacityLabel(code: string | null): string | null {
  if (!code) return null;
  return CAPACITY_UNITS.find((u) => u.code === code)?.name ?? code;
}

export function ObjectCard({
  id,
  embedded,
  onFocusIso,
}: {
  id: string;
  embedded?: boolean;
  /** Колбэк «центрировать карту по зоне доступности» (страница карты, Ф4). */
  onFocusIso?: () => void;
}) {
  const { data, isLoading, isError } = useObject(id);
  const toggleCompare = useUiStore((s) => s.toggleCompare);
  const compareIds = useUiStore((s) => s.compareIds);
  const [tab, setTab] = useState(0);

  if (isLoading) {
    return (
      <Box sx={{ p: 3, display: 'grid', placeItems: 'center' }}>
        <CircularProgress size={28} aria-label="Загрузка карточки объекта" />
      </Box>
    );
  }
  if (isError || !data) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error">Не удалось загрузить карточку объекта.</Typography>
      </Box>
    );
  }

  const o: ObjectDetails = data;
  const readiness = o.readinessPct;

  const share = async () => {
    const url = `${window.location.origin}/objects/${o.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: o.name, url });
        return;
      } catch {
        /* отмена — падаем в буфер обмена */
      }
    }
    await navigator.clipboard?.writeText(url);
  };

  return (
    <Box sx={{ p: embedded ? 0 : 2, height: '100%', overflowY: 'auto' }}>
      <Typography variant={embedded ? 'subtitle1' : 'h6'} sx={{ fontWeight: 700, lineHeight: 1.25, px: embedded ? 2 : 0, pt: embedded ? 1 : 0 }}>
        {o.name}
      </Typography>
      <Stack direction="row" spacing={0.5} sx={{ mt: 1, px: embedded ? 2 : 0, flexWrap: 'wrap', rowGap: 0.5 }} useFlexGap>
        <StatusBadge group={o.statusGroup} name={o.statusName} />
        {o.locationApproximate && <ApproximateLocationBadge />}
        {o.municipalityConflict && (
          <Tooltip title="Координата из реестра не попадает в заявленное МО. Случай на модерации (см. отчёт качества).">
            <Chip size="small" color="warning" label="проверить точку" />
          </Tooltip>
        )}
      </Stack>

      {readiness !== null && (
        <Box sx={{ my: 1.5, px: embedded ? 2 : 0 }}>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="caption" color="text.secondary">
              Строительная готовность
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              {formatPercent(readiness, 0)}
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, Math.max(0, readiness))}
            sx={{ height: 8, borderRadius: 4, mt: 0.5 }}
            aria-label={`Готовность ${Math.round(readiness)} процентов`}
          />
        </Box>
      )}

      <Stack direction="row" spacing={1} sx={{ px: embedded ? 2 : 0, mb: 1, flexWrap: 'wrap', rowGap: 1 }} useFlexGap>
        <Button size="small" variant="outlined" startIcon={<PictureAsPdfIcon />} href={`/objects/${o.id}/passport`} target="_blank">
          Паспорт (PDF)
        </Button>
        <Button size="small" variant="outlined" startIcon={<ShareIcon />} onClick={share}>
          Поделиться
        </Button>
        <Button
          size="small"
          variant={compareIds.includes(o.id) ? 'contained' : 'outlined'}
          startIcon={<CompareArrowsIcon />}
          onClick={() => toggleCompare(o.id)}
        >
          {compareIds.includes(o.id) ? 'В сравнении' : 'Сравнить'}
        </Button>
      </Stack>

      <Divider />

      <Tabs value={tab} onChange={(_, v) => setTab(v as number)} variant="scrollable" scrollButtons="auto" sx={{ px: embedded ? 1 : 0 }}>
        <Tab label="Сводка" />
        <Tab label="Участники" />
        <Tab label="Сроки и документы" />
        <Tab label="Закупки" />
        <Tab label="Фото и медиа" />
        <Tab label="Доступность" />
        <Tab label="Обращения" />
        <Tab label="История места" />
        <Tab label="Таймлайн" />
        <Tab label="Прозрачность" />
      </Tabs>
      <Divider />

      <Box sx={{ p: embedded ? 2 : 0 }}>
        {tab === 0 && <SummaryTab o={o} />}
        {tab === 1 && <ParticipantsTab o={o} />}
        {tab === 2 && <DocumentsTab o={o} />}
        {tab === 3 && <ContractsTab id={o.id} />}
        {tab === 4 && <MediaTab id={o.id} />}
        {tab === 5 && <AccessibilityTab o={o} onFocusIso={onFocusIso} />}
        {tab === 6 && <AppealsTab id={o.id} />}
        {tab === 7 && <HistoryTab o={o} />}
        {tab === 8 && <TimelineTab o={o} />}
        {tab === 9 && <TransparencyTab o={o} />}
      </Box>
    </Box>
  );
}

function SummaryTab({ o }: { o: ObjectDetails }) {
  return (
    <Table size="small" aria-label="Сводка по объекту">
      <TableBody>
        <Row label="Отрасль">{o.industryName}</Row>
        <Row label="Собственность">
          {o.ownership === 'state' ? 'Государственная' : o.ownership === 'municipal' ? 'Муниципальная' : null}
        </Row>
        <Row label="Муниципальное образование">{o.municipalityName}</Row>
        <Row label="Адрес (нормализованный)">{o.addressNormalized}</Row>
        {o.addressRaw && o.addressRaw !== o.addressNormalized && <Row label="Адрес (как в источнике)">{o.addressRaw}</Row>}
        <Row label="Год начала / окончания">{o.yearStart || o.yearEnd ? `${o.yearStart ?? '—'} / ${o.yearEnd ?? '—'}` : null}</Row>
        <Row label="Год ввода в эксплуатацию">{o.commissioningYear}</Row>
        <Row label="Общая площадь">{o.areaM2 !== null ? formatAreaM2(o.areaM2) : null}</Row>
        <Row label="Мощность" hint="Значение из колонки «кол-во мест»; составные значения — в строке источника">
          {o.capacityValue !== null ? `${formatNumberRu(o.capacityValue)} ${capacityLabel(o.capacityUnitCode) ?? ''}`.trim() : null}
        </Row>
        {o.capacityRaw && <Row label="Мощность (источник)">{o.capacityRaw}</Row>}
        <Row label="Код проекта">{o.projectCode}</Row>
        <Row label="НП / ГП">{o.programNp}</Row>
        <Row label="Федеральный проект">{o.programFp}</Row>
      </TableBody>
    </Table>
  );
}

function ParticipantsTab({ o }: { o: ObjectDetails }) {
  return (
    <Table size="small">
      <TableBody>
        <Row label="ГРБС">{o.grbs?.name}</Row>
        <Row label="Заказчик">{o.customer?.name}</Row>
        <Row label="Подрядчик">{o.contractor?.name}</Row>
      </TableBody>
      {o.contractorContractRefs.length > 0 && (
        <TableBody>
          <TableRow>
            <TableCell colSpan={2}>
              <Typography variant="caption" color="text.secondary">
                Реквизиты, извлечённые из ячейки «Подрядчик»:
              </Typography>
              <Stack spacing={0.25} sx={{ mt: 0.5 }}>
                {o.contractorContractRefs.map((r, i) => (
                  <Typography key={i} variant="body2">
                    № {r.number ?? '—'} {r.date ? `от ${formatDateRu(r.date)}` : ''}
                  </Typography>
                ))}
              </Stack>
            </TableCell>
          </TableRow>
        </TableBody>
      )}
    </Table>
  );
}

function DocumentsTab({ o }: { o: ObjectDetails }) {
  return (
    <>
      <Table size="small">
        <TableBody>
          <Row label="Передача земельного участка">{formatDateRu(o.landTransferDate)}</Row>
          <Row label="Разрешение на строительство">{formatDateRu(o.permitDate)}</Row>
          <Row label="Дата заключения контракта">{formatDateRu(o.contractDate)}</Row>
          <Row label="Сроки контракта">
            {o.contractPeriod ? formatDateRangeRu(o.contractPeriod.start, o.contractPeriod.end) ?? o.contractPeriod.raw : null}
          </Row>
          {o.contractPeriod?.note && (
            <Row label="Примечание к срокам">
              <Typography variant="caption" color="text.secondary">
                {o.contractPeriod.note}
              </Typography>
            </Row>
          )}
          <Row label="Установка техоборудования">{formatDateRu(o.equipmentDate)}</Row>
          <Row label="Гидравлические испытания">{formatDateRu(o.hydraulicTestDate)}</Row>
          <Row label="ЗОС (дата / номер)">
            {o.zosDate || o.zosNumber ? `${formatDateRu(o.zosDate) ?? '—'} / ${o.zosNumber ?? '—'}` : null}
          </Row>
          <Row label="Акт ввода (дата / номер)">
            {o.actDate || o.actNumber ? `${formatDateRu(o.actDate) ?? '—'} / ${o.actNumber ?? '—'}` : null}
          </Row>
        </TableBody>
      </Table>
      {o.expertise.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Экспертиза(ы):
          </Typography>
          <Stack spacing={0.5} sx={{ mt: 0.5 }}>
            {o.expertise.map((e, i) => (
              <Typography key={i} variant="body2">
                {e.date ? formatDateRu(e.date) : 'дата не указана'}
                {e.number ? `, № ${e.number}` : ''}
                {e.note ? <Typography component="span" variant="caption" color="text.secondary"> ({e.note})</Typography> : null}
              </Typography>
            ))}
          </Stack>
        </Box>
      )}
    </>
  );
}

function ContractsTab({ id }: { id: string }) {
  const { data, isLoading } = useObjectContracts(id);
  if (isLoading) return <CircularProgress size={22} />;
  if (!data || data.length === 0) {
    return (
      <Alert severity="info" icon={false}>
        Сведения о закупках появятся после подключения ЕИС/регионального портала (итерация 6, docs/INTEGRATION_EIS.md).
      </Alert>
    );
  }
  return (
    <>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <DemoBadge label="демо-данные, не из ЕИС" />
      </Stack>
      {data.map((c) => (
        <Table key={c.id} size="small" sx={{ mb: 1 }}>
          <TableBody>
            <Row label="Реестровый номер">{c.number}</Row>
            <Row label="Дата заключения">{formatDateRu(c.date)}</Row>
            <Row label="Цена контракта">{c.price !== null ? `${formatNumberRu(c.price)} ₽` : null}</Row>
            <Row label="Этап / статус">{[c.stage, c.status].filter(Boolean).join(' · ') || null}</Row>
            <Row label="Сроки исполнения">{formatDateRangeRu(c.executionStart, c.executionEnd)}</Row>
            <Row label="Подрядчик">{c.contractor}</Row>
            <Row label="Источник">{c.source === 'mock' ? 'демо-генерация' : c.source}</Row>
          </TableBody>
        </Table>
      ))}
    </>
  );
}

function MediaTab({ id }: { id: string }) {
  return <MediaViewer objectId={id} />;
}

/** Вкладка «Доступность» (§7 Ф4): зоны пешей доступности и отчёт доступности. */
function AccessibilityTab({ o, onFocusIso }: { o: ObjectDetails; onFocusIso?: () => void }) {
  return (
    <AccessibilityPanel
      objectId={o.id}
      hasExactPoint={o.point !== null}
      municipalityName={o.municipalityName}
      onFocusMap={onFocusIso ? () => onFocusIso() : undefined}
    />
  );
}

function AppealsTab({ id }: { id: string }) {
  const { data, isLoading } = useObjectAppeals(id);
  return (
    <>
      <Button size="small" variant="contained" href={`/appeal?object=${id}`} sx={{ mb: 1 }}>
        Сообщить о проблеме
      </Button>
      {isLoading ? (
        <CircularProgress size={22} />
      ) : !data || data.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Публичных (обезличенных) обращений по этому объекту пока нет. Полноценная лента и подача жалоб — в итерации 6.
        </Typography>
      ) : (
        <Stack spacing={1}>
          {data.map((a) => (
            <Box key={a.publicId}>
              <Typography variant="body2">{a.categoryTitle}</Typography>
              <Typography variant="caption" color="text.secondary">
                {formatDateRu(a.createdAt.slice(0, 10))} · статус: {a.status}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
    </>
  );
}

function HistoryTab({ o }: { o: ObjectDetails }) {
  if (!o.historyOfPlace) {
    return (
      <Alert severity="info" icon={false}>
        История места (что было на участке до начала работ) не предоставлена. Заполняется в админке / из архива заказчика
        (итерация 3). Запрос материалов — через форму обратной связи.
      </Alert>
    );
  }
  const h = o.historyOfPlace;
  return (
    <Table size="small">
      <TableBody>
        <Row label="Прежнее использование">{h.previousUse}</Row>
        <Row label="Описание">{h.description}</Row>
        <Row label="Период">{h.sinceYear ? `с ${h.sinceYear}` : null}</Row>
        <Row label="Источник">{h.source}</Row>
      </TableBody>
    </Table>
  );
}

function TimelineTab({ o }: { o: ObjectDetails }) {
  if (o.timeline.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        <NoData inline />
      </Typography>
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Stack spacing={1}>
      {o.timeline.map((ev, i) => {
        const overdue = ev.date && ev.date < today && o.statusGroup !== 'completed';
        return (
          <Stack key={i} direction="row" spacing={1.5}>
            <Box sx={{ width: 84, flexShrink: 0 }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                {formatDateRu(ev.date)}
              </Typography>
            </Box>
            <Box sx={{ borderLeft: 2, borderColor: overdue ? 'error.main' : 'primary.main', pl: 1.5 }}>
              <Typography variant="body2">{ev.title}</Typography>
              {overdue && (
                <Typography variant="caption" color="error">
                  просрочено
                </Typography>
              )}
            </Box>
          </Stack>
        );
      })}
    </Stack>
  );
}

function TransparencyTab({ o }: { o: ObjectDetails }) {
  return (
    <>
      <Typography variant="caption" color="text.secondary">
        Блок «Прозрачность» (§7 Ф2 п.11) — исходная запись реестра для проверяющих и журналистов. Строка #{o.sourceRowNumber}.
      </Typography>
      <Box
        component="pre"
        sx={{ mt: 1, p: 1, bgcolor: '#263238', color: '#eceff1', borderRadius: 1, fontSize: 11, overflowX: 'auto', maxHeight: 360 }}
      >
        {JSON.stringify(o.raw, null, 2)}
      </Box>
    </>
  );
}
