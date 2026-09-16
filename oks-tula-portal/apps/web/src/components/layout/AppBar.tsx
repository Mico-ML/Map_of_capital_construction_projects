import {
  AppBar as MuiAppBar,
  Box,
  Button,
  IconButton,
  Toolbar,
  Typography,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const NAV = [
  { to: '/map', label: 'Карта' },
  { to: '/accessibility', label: 'Доступность' },
  { to: '/analytics', label: 'Аналитика' },
  { to: '/appeal', label: 'Сообщить о проблеме' },
  { to: '/about', label: 'О портале' },
  { to: '/admin', label: 'Служебный вход' },
];

/** Верхняя панель: логотип, название портала, главное меню (§8). */
export function AppBar() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  return (
    <MuiAppBar position="sticky" color="primary" elevation={2}>
      <Toolbar sx={{ gap: 1 }}>
        {isMobile && (
          <IconButton color="inherit" edge="start" aria-label="Открыть меню" onClick={() => setDrawerOpen(true)}>
            <MenuIcon />
          </IconButton>
        )}
        <Box
          component={Link}
          to="/"
          sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'inherit', textDecoration: 'none', mr: 2 }}
        >
          <Box
            aria-hidden
            sx={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: '#fff',
              color: 'primary.main',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            ОКС
          </Box>
          <Box sx={{ lineHeight: 1.1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Объекты капстроительства
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              Министерство строительства Тульской области
            </Typography>
          </Box>
        </Box>

        {!isMobile && (
          <Box sx={{ ml: 'auto', display: 'flex', gap: 0.5 }}>
            {NAV.map((item) => (
              <Button
                key={item.to}
                component={Link}
                to={item.to}
                color="inherit"
                variant={location.pathname.startsWith(item.to) ? 'outlined' : 'text'}
                sx={location.pathname.startsWith(item.to) ? { borderColor: 'rgba(255,255,255,0.7)' } : undefined}
              >
                {item.label}
              </Button>
            ))}
          </Box>
        )}
      </Toolbar>

      <Drawer anchor="left" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: 280 }} role="presentation" onClick={() => setDrawerOpen(false)}>
          <List>
            {NAV.map((item) => (
              <ListItemButton key={item.to} component={Link} to={item.to} selected={location.pathname.startsWith(item.to)}>
                <ListItemText primary={item.label} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>
    </MuiAppBar>
  );
}
