import { Chip, Tooltip, Typography } from '@mui/material';
import { LOAD_CLASS_STYLES } from '@oks/shared';

/** Бейдж «ДЕМО-ДАННЫЕ» — обязательная пометка синтетики (§2, Приложение C). */
export function DemoBadge({ label = 'ДЕМО-ДАННЫЕ' }: { label?: string }) {
  return (
    <Tooltip title="Демонстрационные данные: не являются сведениями из боевых источников (ЕИС/ПОС). Подключение — на этапе 2 (docs/ROADMAP.md).">
      <Chip
        size="small"
        label={label}
        sx={{
          bgcolor: '#fff3e0',
          color: '#e65100',
          border: '1px solid #ffcc80',
          fontWeight: 700,
          fontSize: 11,
          height: 22,
        }}
      />
    </Tooltip>
  );
}

/** Пустое значение поля → «Нет данных» (§7 Ф2: не прочерки и не пустые ячейки). */
export function NoData({ inline }: { inline?: boolean }) {
  const Comp = inline ? 'span' : 'div';
  return (
    <Typography component={Comp} variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
      Нет данных
    </Typography>
  );
}

/** Индикатор приблизительного местоположения (центроид МО) — §6.3 п.7. */
export function ApproximateLocationBadge() {
  return (
    <Tooltip title="Точное местоположение отсутствует — объект показан в центре муниципального образования. Не участвует в расчёте изохрон и «светофора» без явного согласия.">
      <Chip
        size="small"
        variant="outlined"
        label="местоположение уточняется"
        icon={<span aria-hidden>?</span>}
        sx={{ borderColor: LOAD_CLASS_STYLES.no_data.colorHex, color: '#616161', height: 22, fontSize: 11 }}
      />
    </Tooltip>
  );
}
