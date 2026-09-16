import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  FormControl,
  FormControlLabel,
  Checkbox,
  FormHelperText,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import { APPEAL_CATEGORIES } from '@oks/shared';
import { DemoBadge } from '../components/common/Badges';

/**
 * Публичная форма сообщения о проблеме на стройплощадке (§7 Ф8).
 * Категории — строго из справочника ТЗ. Полноценная подача (геометка, фото,
 * сохранение в БД, номер обращения, интеграция с ПОС, модерация) подключается
 * в итерации 6; здесь — валидируемый каркас формы с честной пометкой демо-режима.
 */
export function AppealPage() {
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [consent, setConsent] = useState(false);
  const [touched, setTouched] = useState(false);

  const descLen = description.trim().length;
  const categoryError = touched && !category ? 'Выберите категорию' : '';
  const descError =
    touched && descLen < 10
      ? 'Опишите проблему подробнее (минимум 10 символов)'
      : descLen > 1000
        ? 'Не более 1000 символов'
        : '';
  const consentError = touched && !consent ? 'Необходимо согласие на обработку персональных данных (152-ФЗ)' : '';
  const categoryRef = APPEAL_CATEGORIES.find((c) => c.code === category);
  const needsComment = categoryRef?.requiresComment ?? false;
  const valid = Boolean(category) && descLen >= 10 && descLen <= 1000 && consent && (!needsComment || descLen >= 10);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    // Боевая отправка (multipart: поля + фото, геометка, номер обращения) — итерация 6.
    // Здесь намеренно не имитируем сохранение, чтобы не создавать ложных обращений.
  };

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Typography variant="h4" gutterBottom>
        Сообщить о проблеме на строительном объекте
      </Typography>
      <Box sx={{ mb: 2 }}>
        <DemoBadge label="подача подключается в итерации 6" />
      </Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Форма находится в разработке: полноценная подача с геометкой, фото (до 5 файлов), выдачей номера обращения,
        отслеживанием статуса и передачей в Платформу обратной связи «Госуслуги. Решаем вместе» подключается на
        итерации 6 (см. docs/ROADMAP.md и docs/INTEGRATION_POS.md). Сейчас доступна проверка структуры и валидации.
      </Alert>

      <Paper sx={{ p: 3 }}>
        <Box component="form" onSubmit={onSubmit} noValidate>
          <FormControl fullWidth sx={{ mb: 2 }} error={Boolean(categoryError)}>
            <InputLabel id="category-label">Категория проблемы</InputLabel>
            <Select
              labelId="category-label"
              label="Категория проблемы"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {APPEAL_CATEGORIES.map((c) => (
                <MenuItem key={c.code} value={c.code}>
                  {c.title}
                </MenuItem>
              ))}
            </Select>
            {categoryError && <FormHelperText>{categoryError}</FormHelperText>}
            {categoryRef && (
              <FormHelperText>
                {categoryRef.description}
                {needsComment ? ' (обязателен развёрнутый комментарий)' : ''} · нормативный срок ответа: {categoryRef.slaDays} дн.
              </FormHelperText>
            )}
          </FormControl>

          <TextField
            fullWidth
            multiline
            minRows={4}
            label="Описание проблемы"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            error={Boolean(descError)}
            helperText={descError || `${descLen} / 1000 символов`}
            sx={{ mb: 2 }}
          />

          <Alert severity="warning" sx={{ mb: 2 }}>
            Не указывайте в описании персональные данные третьих лиц. Геометка, контакты и фото добавляются на этапе
            боевой подачи. Обращение проходит модерацию; публикуется только обезличенная лента.
          </Alert>

          <FormControl error={Boolean(consentError)} sx={{ mb: 2, display: 'block' }}>
            <FormControlLabel
              control={<Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} />}
              label="Я даю согласие на обработку персональных данных в соответствии с 152-ФЗ"
            />
            {consentError && <FormHelperText>{consentError}</FormHelperText>}
          </FormControl>

          <Button type="submit" variant="contained" size="large" disabled={!valid && touched}>
            Отправить обращение
          </Button>
          {touched && !valid && (
            <Typography variant="caption" color="error" sx={{ ml: 2 }}>
              Проверьте заполнение обязательных полей.
            </Typography>
          )}
        </Box>
      </Paper>
    </Container>
  );
}
