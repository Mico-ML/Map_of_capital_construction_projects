import { Box, Button, Card, CardActionArea, Container, Grid, Paper, Skeleton, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { INDUSTRIES, formatNumberRu, pluralRu } from '@oks/shared';
import { useAnalyticsSummary } from '../hooks/useApi';
import { DemoBadge } from '../components/common/Badges';

function KeyFigure({ value, label, loading }: { value: string; label: string; loading?: boolean }) {
  return (
    <Paper sx={{ p: 2, textAlign: 'center', height: '100%' }}>
      {loading ? (
        <Skeleton width={70} sx={{ mx: 'auto' }} />
      ) : (
        <Typography variant="h4" color="primary" sx={{ fontWeight: 800 }}>
          {value}
        </Typography>
      )}
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Paper>
  );
}

const SCENARIOS = [
  { to: '/map', title: 'Что строят рядом со мной', text: 'Открыть карту и отфильтровать объекты по муниципалитету и отрасли.' },
  { to: '/map?statusGroup=completed', title: 'Что уже ввели', text: 'Завершённые объекты по годам ввода и районам области.' },
  { to: '/analytics', title: 'Аналитика отрасли', text: 'Распределения, динамика ввода, объекты риска и топ подрядчиков.' },
  { to: '/appeal', title: 'Сообщить о проблеме', text: 'Строительный мусор, грязь, шум, ограждение — сообщить и отслеживать статус.' },
];

/** Главная страница портала (§7 Ф9): миссия, ключевые цифры, быстрые сценарии, отрасли. */
export function HomePage() {
  const { data, isLoading } = useAnalyticsSummary();

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Интерактивный портал объектов капитального строительства Тульской области
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 860 }}>
          Публичный инструмент Министерства строительства Тульской области: что и когда строится в регионе,
          как это влияет на доступность социальной инфраструктуры, и как сообщить о проблеме на стройплощадке.
          Данные ведомственного реестра — в открытом виде, каждая цифра трассируется к строке источника.
        </Typography>
        {data && data.isMockParts.length > 0 && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5 }}>
            <DemoBadge />
            <Typography variant="caption" color="text.secondary">
              часть разделов работает на демонстрационных данных
            </Typography>
          </Stack>
        )}
      </Box>

      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={6} md={3}>
          <KeyFigure loading={isLoading} value={data ? formatNumberRu(data.totalObjects) ?? '—' : '—'} label="объектов в реестре" />
        </Grid>
        <Grid item xs={6} md={3}>
          <KeyFigure loading={isLoading} value={data ? formatNumberRu(data.completedCount) ?? '—' : '—'} label="введено в эксплуатацию" />
        </Grid>
        <Grid item xs={6} md={3}>
          <KeyFigure loading={isLoading} value={data ? formatNumberRu(data.activeCount) ?? '—' : '—'} label="строится / проектируется" />
        </Grid>
        <Grid item xs={6} md={3}>
          <KeyFigure loading={isLoading} value={data ? formatNumberRu(data.municipalitiesCovered) ?? '—' : '—'} label="охвачено МО" />
        </Grid>
      </Grid>

      <Typography variant="h5" gutterBottom>
        Быстрые сценарии
      </Typography>
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {SCENARIOS.map((s) => (
          <Grid item xs={12} sm={6} md={3} key={s.title}>
            <Card sx={{ height: '100%' }}>
              <CardActionArea component={Link} to={s.to} sx={{ p: 2, height: '100%' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {s.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {s.text}
                </Typography>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Typography variant="h5" gutterBottom>
        Отрасли
      </Typography>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1, mb: 3 }} useFlexGap>
        {INDUSTRIES.map((i) => {
          const count = data?.byIndustry.find((x) => x.code === i.code)?.count ?? 0;
          return (
            <Button key={i.code} component={Link} to={`/map?industry=${i.code}`} variant="outlined" size="small">
              {i.name} {count > 0 ? `· ${count}` : ''}
            </Button>
          );
        })}
      </Stack>

      {data && data.withoutExactLocationCount > 0 && (
        <Paper variant="outlined" sx={{ p: 2, bgcolor: '#fff8e1' }}>
          <Typography variant="body2">
            <strong>{pluralRu(data.withoutExactLocationCount, ['объект', 'объекта', 'объектов'])}</strong> пока не имеют
            точного местоположения в реестре (нет координат, а у части — и адреса). Они показываются в центре своего
            муниципального образования с пометкой «местоположение уточняется» и не участвуют в расчёте зон пешей
            доступности. Ведомству направлен запрос на предоставление геометрии.
          </Typography>
        </Paper>
      )}
    </Container>
  );
}
