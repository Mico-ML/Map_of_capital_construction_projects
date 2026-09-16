import { Container, Divider, Link, Paper, Stack, Typography } from '@mui/material';
import { REGION_ID } from '@oks/shared';

/** О портале: миссия, аудитории, источники данных, методики, дисклеймеры (§1, §8). */
export function AboutPage() {
  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Typography variant="h4" gutterBottom>
        О портале
      </Typography>

      <Paper sx={{ p: 3, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Назначение
        </Typography>
        <Typography variant="body1" paragraph>
          Портал публикует результаты деятельности Министерства строительства Тульской области и строительной отрасли
          региона: строящиеся и введённые объекты капитального строительства (ОКС), сроки, участников и оценку реальной
          доступности социальной инфраструктуры. Цель — повысить информированность граждан и дать инструмент оценки
          обеспеченности муниципалитетов.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Аудитория: граждане (простые ответы «что строят рядом и когда откроют»), сотрудники органов власти и СМИ
          (аналитика, выгрузки, контроль сроков), подрядчики и заказчики (служебная зона актуализации — этап 2).
        </Typography>
      </Paper>

      <Paper sx={{ p: 3, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Источники данных
        </Typography>
        <Stack spacing={1}>
          <Typography variant="body2">
            • Реестр ОКС — ведомственная выгрузка Министерства строительства Тульской области (95 объектов, 35 полей).
            Каждая производная цифра трассируется к строке источника (блок «Прозрачность» в карточке объекта).
          </Typography>
          <Typography variant="body2">
            • Картографическая основа, геокодинг, зоны доступности и POI — 2ГИС MapGL / Isochrone / Catalog API,
            регион <code>region_id = {REGION_ID}</code>. Все запросы к 2ГИС (кроме отрисовки карты в браузере) идут
            через бэкенд-прокси с кэшем и ограничением частоты.
          </Typography>
          <Typography variant="body2">
            • Границы муниципальных образований — OpenStreetMap (лицензия ODbL), упрощение ~85 м. Подлежат замене
            официальными границами (ОКТМО / картографический фонд) на этапе 2.
          </Typography>
          <Typography variant="body2">
            • Население, закупки, обращения граждан, камеры и снимки «до/после» на MVP — демонстрационные данные
            (помечены <code>isMock</code> и бейджем «ДЕМО-ДАННЫЕ»), подлежащие замене боевыми источниками.
          </Typography>
        </Stack>
      </Paper>

      <Paper sx={{ p: 3, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Методики и честность данных
        </Typography>
        <Typography variant="body2" paragraph>
          «Светофор» социальной нагрузки и индекс удовлетворённости — оценочные показатели. Формулы и пороги вынесены
          в конфигурацию и требуют утверждения заказчиком; нормативы градостроительного проектирования приводятся как
          примеры (СП 42.13330.2016). Значения без данных отображаются нейтрально («нет данных»), а не как норма или
          дефицит. Подробная методика — в <code>docs/METHODOLOGY.md</code>.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Объекты без точного местоположения (нет координат, у части — и адреса) показываются в центре муниципального
          образования с пометкой «местоположение уточняется» и не участвуют в расчёте зон пешей доступности без явного
          согласия пользователя на приближённую геометрию.
        </Typography>
      </Paper>

      <Divider sx={{ my: 2 }} />
      <Typography variant="body2" color="text.secondary">
        Документация: README, ARCHITECTURE, DATA_MODEL, API, DECISIONS, ROADMAP, METHODOLOGY, IMAGERY, INTEGRATIONS.
        Открытые данные и публичный API — на этапе 4 дорожной карты. Связь с командой: через форму «Сообщить о проблеме».
        Оперативная проверка геоданных при разработке возможна через MCP-сервер 2ГИС для AI-агентов (
        <Link href="https://docs.2gis.com/api/ai/mcp-server/overview" target="_blank" rel="noreferrer">
          документация
        </Link>
        ).
      </Typography>
    </Container>
  );
}
