import { Chip } from '@mui/material';
import type { StatusGroupCode } from '@oks/shared';
import { STATUS_GROUPS } from '@oks/shared';

/**
 * Бейдж статуса: цвет группы + текстовое название + символьный знак.
 * Информация никогда не передаётся только цветом (§8, доступность/ч-б печать).
 */
const GROUP_SYMBOL: Record<StatusGroupCode, string> = {
  design: '◱',
  construction: '▲',
  procurement: '◆',
  completed: '●',
};

export function StatusBadge({ group, name }: { group: StatusGroupCode | null; name: string | null }) {
  if (!group || !name) return <Chip size="small" variant="outlined" label="статус не указан" />;
  const meta = STATUS_GROUPS[group];
  return (
    <Chip
      size="small"
      label={`${GROUP_SYMBOL[group]} ${name}`}
      sx={{
        bgcolor: meta.colorHex,
        color: '#fff',
        fontWeight: 600,
        fontSize: 12,
      }}
      title={meta.label}
    />
  );
}
