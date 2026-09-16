import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import type { StatusGroupCode } from '@oks/shared';
import { STATUS_GROUPS } from '@oks/shared';
import { useUiStore, STATUS_GROUP_ORDER } from '../../store/ui';
import { useDictionary } from '../../hooks/useApi';

const GROUP_SHORT: Record<StatusGroupCode, string> = {
  design: 'Проект',
  construction: 'Строится',
  procurement: 'Закупки',
  completed: 'Завершено',
};
const YEAR_MIN = 2019;
const YEAR_MAX = 2029;

/** Панель фильтров (§7 Ф1): отрасль, статус, МО, собственность, организации, годы, готовность, фото/камера, «рядом». */
export function FilterPanel() {
  const filters = useUiStore((s) => s.filters);
  const setFilters = useUiStore((s) => s.setFilters);
  const resetFilters = useUiStore((s) => s.resetFilters);

  const { data: industries } = useDictionary('industry');
  const { data: municipalities } = useDictionary('municipality');
  const { data: organizations } = useDictionary('organization');

  const orgNames = useMemo(() => {
    const byType = (type: string) =>
      (organizations ?? []).filter((o) => o['type'] === type).map((o) => String(o['name'] ?? o['nameNormalized'] ?? ''));
    return { customer: byType('customer'), contractor: byType('contractor') };
  }, [organizations]);

  // Поиск с debounce 300 мс (§8)
  const [q, setQ] = useState(filters.q ?? '');
  useEffect(() => {
    const t = setTimeout(() => setFilters({ q: q || undefined }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const groups = filters.statusGroup ?? [];
  const toggleGroup = (g: StatusGroupCode) => {
    const next = groups.includes(g) ? groups.filter((x) => x !== g) : [...groups, g];
    setFilters({ statusGroup: next.length ? next : undefined });
  };

  const yearRange: [number, number] = [filters.yearFrom ?? YEAR_MIN, filters.yearTo ?? YEAR_MAX];

  const locateNearMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setFilters({ near: `${pos.coords.longitude.toFixed(5)},${pos.coords.latitude.toFixed(5)},50000` }),
      () => setFilters({ near: undefined }),
    );
  };

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle2">Фильтры</Typography>
        <Button size="small" onClick={resetFilters}>
          Сбросить
        </Button>
      </Stack>

      <TextField
        label="Поиск: название, адрес, подрядчик"
        size="small"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        inputProps={{ 'aria-label': 'Поиск по объектам' }}
      />

      <Box>
        <Typography variant="caption" color="text.secondary">
          Группа статуса
        </Typography>
        <ToggleButtonGroup size="small" sx={{ mt: 0.5, flexWrap: 'wrap' }}>
          {STATUS_GROUP_ORDER.map((g) => (
            <ToggleButton
              key={g}
              value={g}
              selected={groups.includes(g)}
              onClick={() => toggleGroup(g)}
              aria-pressed={groups.includes(g)}
              sx={{
                px: 1.5,
                m: 0.25,
                borderRadius: 1,
                border: '1px solid',
                borderColor: groups.includes(g) ? STATUS_GROUPS[g].colorHex : 'divider',
                bgcolor: groups.includes(g) ? STATUS_GROUPS[g].colorHex : 'transparent',
                color: groups.includes(g) ? '#fff' : 'text.primary',
              }}
            >
              {GROUP_SHORT[g]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <MultiSelect
        label="Отрасль"
        options={(industries ?? []).map((i) => ({ value: i.id, label: String(i.name) }))}
        value={filters.industry ?? []}
        onChange={(v) => setFilters({ industry: v.length ? v : undefined })}
      />
      <MultiSelect
        label="Муниципальное образование"
        options={(municipalities ?? []).map((m) => ({ value: m.id, label: String(m.name) }))}
        value={filters.municipality ?? []}
        onChange={(v) => setFilters({ municipality: v.length ? v : undefined })}
      />
      <MultiSelect
        label="Форма собственности"
        options={[
          { value: 'state', label: 'Государственная' },
          { value: 'municipal', label: 'Муниципальная' },
          { value: 'unknown', label: 'Не указана' },
        ]}
        value={(filters.ownership as string[]) ?? []}
        onChange={(v) => setFilters({ ownership: v.length ? (v as typeof filters.ownership) : undefined })}
      />
      <Autocomplete
        multiple
        size="small"
        options={orgNames.contractor}
        value={filters.contractor ?? []}
        onChange={(_, v) => setFilters({ contractor: v.length ? v : undefined })}
        renderInput={(params) => <TextField {...params} label="Подрядчик" />}
        renderTags={(value, getTagProps) =>
          value.map((option, index) => {
            const { key, ...tagProps } = getTagProps({ index });
            return <Chip key={key} label={option} size="small" {...tagProps} />;
          })
        }
      />
      <Autocomplete
        multiple
        size="small"
        options={orgNames.customer}
        value={filters.customer ?? []}
        onChange={(_, v) => setFilters({ customer: v.length ? v : undefined })}
        renderInput={(params) => <TextField {...params} label="Заказчик" />}
        renderTags={(value, getTagProps) =>
          value.map((option, index) => {
            const { key, ...tagProps } = getTagProps({ index });
            return <Chip key={key} label={option} size="small" {...tagProps} />;
          })
        }
      />

      <Box>
        <Typography variant="caption" color="text.secondary">
          Год ввода/окончания: {yearRange[0]}–{yearRange[1]}
        </Typography>
        <Slider
          size="small"
          value={yearRange}
          min={YEAR_MIN}
          max={YEAR_MAX}
          step={1}
          valueLabelDisplay="auto"
          onChange={(_, v) => {
            const [from, to] = v as [number, number];
            setFilters({
              yearFrom: from > YEAR_MIN ? from : undefined,
              yearTo: to < YEAR_MAX ? to : undefined,
            });
          }}
          aria-label="Диапазон годов"
        />
      </Box>

      <Box>
        <Typography variant="caption" color="text.secondary">
          Строительная готовность, не ниже: {filters.readinessMin ?? 0}%
        </Typography>
        <Slider
          size="small"
          value={filters.readinessMin ?? 0}
          min={0}
          max={100}
          step={5}
          valueLabelDisplay="auto"
          onChange={(_, v) => setFilters({ readinessMin: (v as number) > 0 ? (v as number) : undefined })}
          aria-label="Минимальная строительная готовность"
        />
      </Box>

      <Stack direction="row" spacing={1}>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={filters.hasMedia === 'true'}
              onChange={(e) => setFilters({ hasMedia: e.target.checked ? 'true' : undefined })}
            />
          }
          label={<Typography variant="body2">с фото</Typography>}
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={filters.hasCamera === 'true'}
              onChange={(e) => setFilters({ hasCamera: e.target.checked ? 'true' : undefined })}
            />
          }
          label={<Typography variant="body2">с камерой</Typography>}
        />
      </Stack>

      <Stack direction="row" spacing={1} alignItems="center">
        <Button
          size="small"
          variant={filters.near ? 'contained' : 'outlined'}
          startIcon={<MyLocationIcon />}
          onClick={locateNearMe}
        >
          Рядом со мной
        </Button>
        {filters.near && (
          <Button size="small" onClick={() => setFilters({ near: undefined })}>
            сбросить
          </Button>
        )}
      </Stack>

      <Divider />

      <FormControl size="small">
        <InputLabel id="sort-label">Сортировка</InputLabel>
        <Select
          labelId="sort-label"
          label="Сортировка"
          value={filters.sort ?? 'name'}
          onChange={(e) => setFilters({ sort: e.target.value as typeof filters.sort })}
        >
          <MenuItem value="name">По названию</MenuItem>
          <MenuItem value="commissioningYear">По году ввода</MenuItem>
          <MenuItem value="readiness">По готовности</MenuItem>
          <MenuItem value="yearEnd">По году окончания</MenuItem>
        </Select>
      </FormControl>
    </Box>
  );
}

function MultiSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <FormControl size="small">
      <InputLabel id={`sel-${label}`}>{label}</InputLabel>
      <Select
        labelId={`sel-${label}`}
        label={label}
        multiple
        value={value}
        onChange={(e) => onChange((e.target.value as string[]) ?? [])}
        renderValue={(selected) => (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {(selected as string[]).map((code) => (
              <Chip key={code} size="small" label={options.find((o) => o.value === code)?.label ?? code} />
            ))}
          </Box>
        )}
      >
        {options.map((o) => (
          <MenuItem key={o.value} value={o.value}>
            {o.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
