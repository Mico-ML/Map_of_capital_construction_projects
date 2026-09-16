import { Box, Button, IconButton, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type { ObjectDetails } from '@oks/shared';
import { formatAreaM2, formatDateRu, formatNumberRu } from '@oks/shared';
import { useObject } from '../../hooks/useApi';
import { MiniMap } from '../map/MiniMap';

/** Строка таблицы сравнения: название + значения по объектам («Нет данных» для пустых). */
function CompareRow({ label, values }: { label: string; values: (string | null)[] }) {
  return (
    <TableRow>
      <TableCell component="th" sx={{ color: 'text.secondary', width: 200 }}>
        {label}
      </TableCell>
      {values.map((v, i) => (
        <TableCell key={i}>
          {v ?? (
            <Typography component="span" variant="body2" color="text.disabled">
              Нет данных
            </Typography>
          )}
        </TableCell>
      ))}
    </TableRow>
  );
}

/** Панель сравнения до 3 объектов: таблица атрибутов + мини-карты (§7 Ф1). */
export function ComparisonPanel({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  // три хука вызываются безусловно (до 3 объектов) — порядок хуков стабилен
  const a = useObject(ids[0] ?? null);
  const b = useObject(ids[1] ?? null);
  const c = useObject(ids[2] ?? null);
  const objs = [a.data, b.data, c.data].filter((x): x is ObjectDetails => Boolean(x));
  const col = (fn: (o: ObjectDetails) => string | null) => objs.map(fn);

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6">Сравнение объектов ({ids.length}/3)</Typography>
        <IconButton onClick={onClose} aria-label="Закрыть сравнение">
          <CloseIcon />
        </IconButton>
      </Box>
      {objs.length === 0 ? (
        <Typography variant="body2">Загрузка…</Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableBody>
              <TableRow>
                <TableCell component="th" sx={{ width: 200 }} />
                {objs.map((o) => (
                  <TableCell key={o.id}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {o.name}
                    </Typography>
                    <Box sx={{ mt: 1 }}>
                      <MiniMap center={o.displayPoint} />
                    </Box>
                  </TableCell>
                ))}
              </TableRow>
              <CompareRow label="Статус" values={col((o) => o.statusName)} />
              <CompareRow label="Отрасль" values={col((o) => o.industryName)} />
              <CompareRow label="Муниципальное образование" values={col((o) => o.municipalityName)} />
              <CompareRow label="Адрес" values={col((o) => o.addressNormalized)} />
              <CompareRow label="Готовность, %" values={col((o) => (o.readinessPct !== null ? `${o.readinessPct}` : null))} />
              <CompareRow label="Площадь" values={col((o) => (o.areaM2 !== null ? formatAreaM2(o.areaM2) : null))} />
              <CompareRow label="Мощность" values={col((o) => (o.capacityValue !== null ? formatNumberRu(o.capacityValue) : null))} />
              <CompareRow label="Год ввода" values={col((o) => (o.commissioningYear ? String(o.commissioningYear) : null))} />
              <CompareRow label="Заказчик" values={col((o) => o.customer?.name ?? null)} />
              <CompareRow label="Подрядчик" values={col((o) => o.contractor?.name ?? null)} />
              <CompareRow label="Дата контракта" values={col((o) => formatDateRu(o.contractDate))} />
              <TableRow>
                <TableCell component="th" />
                {objs.map((o) => (
                  <TableCell key={o.id}>
                    <Button size="small" href={`/objects/${o.id}`}>
                      Открыть карточку
                    </Button>
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
}
