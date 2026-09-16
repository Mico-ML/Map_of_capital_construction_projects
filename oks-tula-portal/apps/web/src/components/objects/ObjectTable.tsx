import {
  Box,
  Checkbox,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography,
} from '@mui/material';
import type { ObjectSummary } from '@oks/shared';
import { formatAreaM2, formatNumberRu, formatDateRu, pluralRu } from '@oks/shared';
import { useUiStore } from '../../store/ui';
import { StatusBadge } from './StatusBadge';

interface ObjectTableProps {
  objects: ObjectSummary[];
  total: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
}

/** Табличный режим списка объектов (§7 Ф1) с сортировкой и выбором для сравнения. */
export function ObjectTable({ objects, total, selectedId, onSelect, loading }: ObjectTableProps) {
  const toggleCompare = useUiStore((s) => s.toggleCompare);
  const compareIds = useUiStore((s) => s.compareIds);
  const filters = useUiStore((s) => s.filters);
  const setFilters = useUiStore((s) => s.setFilters);

  const sortBy = (col: typeof filters.sort) => setFilters({ sort: col });

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <Box sx={{ px: 2, py: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          Показано {objects.length} из {pluralRu(total, ['объекта', 'объектов', 'объектов'])}
        </Typography>
        {loading && <LinearProgress sx={{ mt: 0.5 }} />}
      </Box>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox" aria-label="Сравнить" />
            <TableCell sortDirection={filters.sort === 'name' ? 'asc' : false}>
              <TableSortLabel active={filters.sort === 'name'} direction="asc" onClick={() => sortBy('name')}>
                Наименование
              </TableSortLabel>
            </TableCell>
            <TableCell>Статус</TableCell>
            <TableCell>МО</TableCell>
            <TableCell align="right" sortDirection={filters.sort === 'readiness' ? 'desc' : false}>
              <TableSortLabel active={filters.sort === 'readiness'} direction="desc" onClick={() => sortBy('readiness')}>
                Готов.
              </TableSortLabel>
            </TableCell>
            <TableCell align="right">Площадь</TableCell>
            <TableCell align="right" sortDirection={filters.sort === 'commissioningYear' ? 'desc' : false}>
              <TableSortLabel active={filters.sort === 'commissioningYear'} direction="desc" onClick={() => sortBy('commissioningYear')}>
                Ввод
              </TableSortLabel>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {objects.length === 0 && !loading && (
            <TableRow>
              <TableCell colSpan={7}>
                <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                  Нет объектов по заданным фильтрам.
                </Typography>
              </TableCell>
            </TableRow>
          )}
          {objects.map((o) => (
            <TableRow
              key={o.id}
              hover
              selected={o.id === selectedId}
              onClick={() => onSelect(o.id)}
              sx={{ cursor: 'pointer' }}
            >
              <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                <Tooltip title="Добавить к сравнению (до 3)">
                  <Checkbox size="small" checked={compareIds.includes(o.id)} onChange={() => toggleCompare(o.id)} />
                </Tooltip>
              </TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {o.name}
                </Typography>
                {o.locationApproximate && (
                  <Typography variant="caption" color="text.secondary">
                    местоположение уточняется
                  </Typography>
                )}
              </TableCell>
              <TableCell>
                <StatusBadge group={o.statusGroup} name={o.statusName} />
              </TableCell>
              <TableCell>{o.municipalityName ?? '—'}</TableCell>
              <TableCell align="right">{o.readinessPct !== null ? `${Math.round(o.readinessPct)}%` : '—'}</TableCell>
              <TableCell align="right">{o.areaM2 !== null ? formatAreaM2(o.areaM2) : '—'}</TableCell>
              <TableCell align="right">{o.commissioningYear ?? formatDateRu(null) ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Box sx={{ px: 2, py: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Всего мощность/площадь по выборке — в аналитике. Числа: {formatNumberRu(total)}.
        </Typography>
      </Box>
    </Box>
  );
}
