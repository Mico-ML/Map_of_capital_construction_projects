import { Box, Container, Link, Typography } from '@mui/material';
import { useAnalyticsSummary } from '../../hooks/useApi';

/** Подвал: дисклеймеры о статусе данных, методиках и демо-режиме (§8). */
export function SiteFooter() {
  const { data } = useAnalyticsSummary();
  const actual = data?.dataActualDate;
  const mockParts = data?.isMockParts ?? [];
  return (
    <Box component="footer" sx={{ bgcolor: '#263238', color: '#eceff1', py: 3, mt: 'auto' }}>
      <Container maxWidth="lg">
        <Typography variant="body2" sx={{ mb: 1 }}>
          Интерактивный портал объектов капитального строительства Тульской области.
          {actual ? ` Данные реестра актуальны на ${actual}.` : ''} Картографическая основа — 2ГИС MapGL.
        </Typography>
        <Typography variant="caption" component="p" sx={{ display: 'block', opacity: 0.85 }}>
          Границы муниципальных образований — OpenStreetMap (ODbL). Расчёты доступности и «светофор» соцнагрузки
          являются оценочными; методика — в разделе «О портале».
        </Typography>
        {mockParts.length > 0 && (
          <Typography variant="caption" component="p" sx={{ display: 'block', mt: 1, color: '#ffcc80' }}>
            ДЕМО-ДАННЫЕ: закупки, обращения, камеры, снимки «до/после» и геокодинг работают на демонстрационных
            данных до подключения боевых источников.
          </Typography>
        )}
        <Typography variant="caption" component="p" sx={{ display: 'block', mt: 1, opacity: 0.7 }}>
          Первоисточник данных — ведомственный реестр ОКС. Нашли ошибку?{' '}
          <Link href="/appeal" color="#90caf9">
            Сообщите о проблеме
          </Link>
          .
        </Typography>
      </Container>
    </Box>
  );
}
