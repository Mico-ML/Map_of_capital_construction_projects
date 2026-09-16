import { Button, Container, Typography } from '@mui/material';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
      <Typography variant="h2" color="primary" sx={{ fontWeight: 800 }}>
        404
      </Typography>
      <Typography variant="h6" gutterBottom>
        Страница не найдена
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Возможно, ссылка устарела или объект был перемещён в архив.
      </Typography>
      <Button component={Link} to="/" variant="contained">
        На главную
      </Button>
    </Container>
  );
}
