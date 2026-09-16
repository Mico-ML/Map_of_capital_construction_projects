import { Box, Container, Paper, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import { ObjectCard } from '../components/objects/ObjectCard';

/** Отдельная страница объекта (deep link /objects/:id, §7 Ф1). */
export function ObjectPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      {!id ? (
        <Typography color="error">Не указан идентификатор объекта.</Typography>
      ) : (
        <Paper elevation={1} sx={{ p: { xs: 1, sm: 2 } }}>
          <ObjectCard id={id} />
        </Paper>
      )}
      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Печать/скачивание PDF-паспорта объекта и кнопка «Поделиться» появятся в итерации 2 (docs/ROADMAP.md).
        </Typography>
      </Box>
    </Container>
  );
}
