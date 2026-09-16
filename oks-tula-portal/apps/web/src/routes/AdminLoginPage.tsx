import { Alert, Box, Container, Paper, Stack, TextField, Button, Typography } from '@mui/material';
import { DemoBadge } from '../components/common/Badges';

/**
 * Служебный вход (§7 Ф9): роли editor / moderator / admin.
 * На MVP — заглушка формы; боевая авторизация (JWT + refresh, OIDC/ЕСИА)
 * и RBAC подключаются на итерации 6 и этапе 2 (docs/ROADMAP.md).
 */
export function AdminLoginPage() {
  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        Служебный вход
      </Typography>
      <Box sx={{ mb: 2 }}>
        <DemoBadge label="авторизация — итерация 6" />
      </Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Раздел для сотрудников органов власти, модераторов и подрядчиков. Авторизация (JWT с коротким TTL + refresh,
        для граждан — через ЕСИА/OIDC) и ролевая модель (public / editor / moderator / admin) подключаются на итерации 6.
        Первичный администратор создаётся при сидировании, если заданы <code>ADMIN_EMAIL</code> и <code>ADMIN_PASSWORD</code>.
      </Alert>
      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          <TextField label="Email или СНИЛС (ЕСИА)" size="small" disabled />
          <TextField label="Пароль" type="password" size="small" disabled />
          <Button variant="contained" size="large" disabled>
            Войти
          </Button>
          <Typography variant="caption" color="text.secondary">
            Возможности служебной зоны: модерация жалоб, уточнение координат и атрибутов, загрузка фото/рендеров,
            справочники, отчёт о качестве данных, журнал аудита.
          </Typography>
        </Stack>
      </Paper>
    </Container>
  );
}
