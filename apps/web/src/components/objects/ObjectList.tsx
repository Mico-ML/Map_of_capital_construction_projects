import { Box, LinearProgress, ListItemButton, ListItemText, Stack, Typography } from '@mui/material';
import type { ObjectSummary } from '@oks/shared';
import { pluralRu } from '@oks/shared';
import { StatusBadge } from './StatusBadge';
import { ApproximateLocationBadge } from '../common/Badges';

interface ObjectListProps {
  objects: ObjectSummary[];
  total: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  withoutExactLocation: number;
}

/** Список объектов слева от карты; синхронизация «список ↔ карта» (§7 Ф1). */
export function ObjectList({ objects, total, selectedId, onSelect, loading, withoutExactLocation }: ObjectListProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          Показано {objects.length} из {pluralRu(total, ['объекта', 'объектов', 'объектов'])}
        </Typography>
        {withoutExactLocation > 0 && (
          <Typography variant="caption" color="text.secondary">
            Объектов без точного местоположения: {withoutExactLocation}
          </Typography>
        )}
        {loading && <LinearProgress sx={{ mt: 1 }} />}
      </Box>
      <Box sx={{ overflowY: 'auto', flex: 1 }}>
        {objects.length === 0 && !loading && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            Нет объектов по заданным фильтрам — измените условия или сбросьте фильтры.
          </Typography>
        )}
        {objects.map((o) => (
          <ListItemButton
            key={o.id}
            selected={o.id === selectedId}
            onClick={() => onSelect(o.id)}
            sx={{ borderBottom: 1, borderColor: 'divider', py: 1 }}
          >
            <ListItemText
              primary={
                <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.25 }}>
                  {o.name}
                </Typography>
              }
              secondary={
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', rowGap: 0.5 }} useFlexGap>
                  <StatusBadge group={o.statusGroup} name={o.statusName} />
                  {o.municipalityName && (
                    <Typography variant="caption" color="text.secondary">
                      {o.municipalityName}
                    </Typography>
                  )}
                  {o.locationApproximate && <ApproximateLocationBadge />}
                </Stack>
              }
            />
            {o.readinessPct !== null && o.readinessPct < 100 && (
              <Box sx={{ minWidth: 46, textAlign: 'right' }}>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  {Math.round(o.readinessPct)}%
                </Typography>
              </Box>
            )}
          </ListItemButton>
        ))}
      </Box>
    </Box>
  );
}
