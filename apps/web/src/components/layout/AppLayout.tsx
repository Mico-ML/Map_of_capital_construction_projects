import { Outlet } from 'react-router-dom';
import { AppBar } from './AppBar';
import { SiteFooter } from './SiteFooter';
import { Box } from '@mui/material';

/** Общий макет: шапка, контент, подвал. Skip-link — доступность (§8). */
export function AppLayout() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <a className="skip-link" href="#main-content">
        Перейти к содержимому
      </a>
      <AppBar />
      <Box id="main-content" component="main" sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </Box>
      <SiteFooter />
    </Box>
  );
}
