import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { AppLayout } from './components/layout/AppLayout';
import { HomePage } from './routes/HomePage';
import { MapPage } from './routes/MapPage';
import { ObjectPage } from './routes/ObjectPage';
import { AppealPage } from './routes/AppealPage';
import { AboutPage } from './routes/AboutPage';
import { AdminLoginPage } from './routes/AdminLoginPage';
import { NotFoundPage } from './routes/NotFoundPage';

// Ленивая загрузка тяжёлых маршрутов (recharts в аналитике, qrcode в паспорте) —
// не грузим их на главной/карте и снижаем пиковую память сборки (§8, §9)
const AnalyticsPage = lazy(() =>
  import('./routes/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
);
const PassportPage = lazy(() => import('./routes/PassportPage').then((m) => ({ default: m.PassportPage })));
// Пакетный режим Ф4 (изохроны по отрасли/МО, «белые пятна») — тяжёлая страница с картой
const AccessibilityPage = lazy(() =>
  import('./routes/AccessibilityPage').then((m) => ({ default: m.AccessibilityPage })),
);

function RouteFallback() {
  return (
    <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', py: 8 }}>
      <CircularProgress aria-label="Загрузка раздела" />
    </Box>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/objects/:id" element={<ObjectPage />} />
        <Route
          path="/objects/:id/passport"
          element={
            <Suspense fallback={<RouteFallback />}>
              <PassportPage />
            </Suspense>
          }
        />
        <Route
          path="/accessibility"
          element={
            <Suspense fallback={<RouteFallback />}>
              <AccessibilityPage />
            </Suspense>
          }
        />
        <Route
          path="/analytics"
          element={
            <Suspense fallback={<RouteFallback />}>
              <AnalyticsPage />
            </Suspense>
          }
        />
        <Route path="/appeal" element={<AppealPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/admin" element={<AdminLoginPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
