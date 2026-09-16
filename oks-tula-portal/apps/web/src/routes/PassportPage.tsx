import { useEffect, useState } from 'react';
import { Box, Button, Container, Paper, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  CAPACITY_UNITS,
  formatAreaM2,
  formatDateRu,
  formatDateRangeRu,
  formatNumberRu,
  formatPercent,
} from '@oks/shared';
import { useObject } from '../hooks/useApi';

function capacityLabel(code: string | null): string | null {
  if (!code) return null;
  return CAPACITY_UNITS.find((u) => u.code === code)?.name ?? code;
}

/**
 * Паспорт объекта (§7 Ф2 п.9): брендированная одностраничная форма для печати/сохранения
 * в PDF (кнопка «Печать» → «Сохранить как PDF» в браузере) с QR-кодом на страницу объекта.
 * Печать через window.print() + @media print CSS — надёжно поддерживает кириллицу
 * (в отличие от клиентских PDF-библиотек без встроенных шрифтов).
 */
export function PassportPage() {
  const { id } = useParams<{ id: string }>();
  const { data: o, isLoading } = useObject(id ?? null);
  const [qr, setQr] = useState<string>('');

  const objectUrl = `${window.location.origin}/objects/${id ?? ''}`;
  useEffect(() => {
    QRCode.toDataURL(objectUrl, { width: 160, margin: 1 })
      .then(setQr)
      .catch(() => setQr(''));
  }, [objectUrl]);

  if (isLoading || !o) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography>Загрузка паспорта объекта…</Typography>
      </Container>
    );
  }

  const row = (label: string, value: React.ReactNode) => (
    <TableRow>
      <TableCell sx={{ width: '40%', color: '#444', border: '1px solid #ccc' }}>{label}</TableCell>
      <TableCell sx={{ border: '1px solid #ccc', fontWeight: 500 }}>{value ?? <i>Нет данных</i>}</TableCell>
    </TableRow>
  );

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} className="no-print">
        <Button variant="contained" onClick={() => window.print()}>
          Печать / Сохранить PDF
        </Button>
        <Button variant="outlined" href={`/objects/${o.id}`}>
          К карточке объекта
        </Button>
      </Stack>

      <Paper sx={{ p: 4 }} id="passport">
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
          <Box>
            <Typography variant="overline" color="text.secondary">
              Министерство строительства Тульской области
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              Паспорт объекта капитального строительства
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Интерактивный портал ОКС · данные реестра на {formatDateRu(o.importedAt?.slice(0, 10))}
            </Typography>
          </Box>
          {qr && <img src={qr} alt="QR-код на страницу объекта" width={120} height={120} />}
        </Stack>

        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          {o.name}
        </Typography>

        <Table size="small" sx={{ mb: 2 }}>
          <TableBody>
            {row('Статус', o.statusName)}
            {row('Отрасль', o.industryName)}
            {row('Муниципальное образование', o.municipalityName)}
            {row('Адрес', o.addressNormalized ?? o.addressRaw)}
            {row('Собственность', o.ownership === 'state' ? 'Государственная' : o.ownership === 'municipal' ? 'Муниципальная' : 'Не указана')}
            {row('Готовность', o.readinessPct !== null ? formatPercent(o.readinessPct, 0) : null)}
            {row('Общая площадь', o.areaM2 !== null ? formatAreaM2(o.areaM2) : null)}
            {row(
              'Мощность',
              o.capacityValue !== null ? `${formatNumberRu(o.capacityValue)} ${capacityLabel(o.capacityUnitCode) ?? ''}`.trim() : null,
            )}
            {row('Год начала / окончания', o.yearStart || o.yearEnd ? `${o.yearStart ?? '—'} / ${o.yearEnd ?? '—'}` : null)}
            {row('Год ввода в эксплуатацию', o.commissioningYear)}
            {row('ГРБС', o.grbs?.name)}
            {row('Заказчик', o.customer?.name)}
            {row('Подрядчик', o.contractor?.name)}
            {row('Дата заключения контракта', formatDateRu(o.contractDate))}
            {row('Сроки контракта', o.contractPeriod ? formatDateRangeRu(o.contractPeriod.start, o.contractPeriod.end) : null)}
            {row('ЗОС (дата / номер)', o.zosDate || o.zosNumber ? `${formatDateRu(o.zosDate) ?? '—'} / ${o.zosNumber ?? '—'}` : null)}
            {row('Акт ввода (дата / номер)', o.actDate || o.actNumber ? `${formatDateRu(o.actDate) ?? '—'} / ${o.actNumber ?? '—'}` : null)}
            {row('НП / ГП', o.programNp)}
            {row('Федеральный проект', o.programFp)}
            {row('Код проекта', o.projectCode)}
          </TableBody>
        </Table>

        <Typography variant="caption" color="text.secondary">
          Страница объекта (актуальные данные): {objectUrl} · Строка источника №{o.sourceRowNumber}.
          Паспорт сформирован автоматически из ведомственного реестра; является информационной справкой.
        </Typography>
      </Paper>

      {/* Печать: только паспорт, формат A4 */}
      <style>{`
        @media print {
          .no-print, header, footer { display: none !important; }
          body { background: #fff; }
          #passport { box-shadow: none; border: none; }
          @page { size: A4; margin: 14mm; }
        }
      `}</style>
    </Container>
  );
}
