import { createTheme } from '@mui/material/styles';
import { ruRU } from '@mui/material/locale';
import { LOAD_CLASS_STYLES, STATUS_GROUP_COLORS } from '@oks/shared';

/**
 * Тема портала (§8): русская локаль, палитра «светофора», контраст ≥ 4.5:1,
 * крупные тач-зоны (≥ 44 px), поддержка prefers-reduced-motion через CSS.
 */
export const theme = createTheme(
  {
    palette: {
      mode: 'light',
      primary: { main: '#1565C0', contrastText: '#fff' },
      secondary: { main: '#2E7D32', contrastText: '#fff' },
      warning: { main: LOAD_CLASS_STYLES.border.colorHex },
      error: { main: LOAD_CLASS_STYLES.deficit.colorHex },
      success: { main: LOAD_CLASS_STYLES.normal.colorHex },
      background: { default: '#f5f6f8', paper: '#ffffff' },
      text: { primary: '#1a1a1a', secondary: '#4a4a4a' },
    },
    typography: {
      fontFamily: '"Roboto", "Helvetica Neue", Arial, sans-serif',
      h4: { fontWeight: 700 },
      h5: { fontWeight: 700 },
      h6: { fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    shape: { borderRadius: 8 },
    components: {
      MuiButton: {
        styleOverrides: { root: { minHeight: 44, textTransform: 'none' } },
      },
      MuiIconButton: { styleOverrides: { root: { minHeight: 44, minWidth: 44 } } },
      MuiChip: { styleOverrides: { root: { minHeight: 32 } } },
      MuiCssBaseline: {
        styleOverrides: {
          '@media (prefers-reduced-motion: reduce)': {
            '*': { animation: 'none !important', transition: 'none !important' },
          },
          // доступность: видимый фокус при клавиатурной навигации
          ':focus-visible': { outline: '3px solid #1565C0', outlineOffset: '2px' },
          '.skip-link': {
            position: 'absolute',
            left: '-9999px',
            top: 0,
            zIndex: 2000,
            padding: '12px 16px',
            background: '#1565C0',
            color: '#fff',
          },
          '.skip-link:focus': { left: 0 },
        },
      },
    },
  },
  ruRU,
);

/** Цвета групп статусов и классов нагрузки для карты/легенд (единый источник). */
export { STATUS_GROUP_COLORS, LOAD_CLASS_STYLES };
