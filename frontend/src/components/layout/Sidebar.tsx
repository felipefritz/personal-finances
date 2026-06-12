import { NavLink } from 'react-router-dom';
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  Toolbar,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import CategoryIcon from '@mui/icons-material/Category';
import SavingsIcon from '@mui/icons-material/Savings';
import PieChartIcon from '@mui/icons-material/PieChart';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import LinkIcon from '@mui/icons-material/Link';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';

const NAV_GROUPS = [
  {
    group: 'Principal',
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: <DashboardIcon fontSize="small" /> },
      { label: 'Proyección', to: '/proyeccion', icon: <CalendarMonthIcon fontSize="small" /> },
    ],
  },
  {
    group: 'Dinero',
    items: [
      { label: 'Cuentas', to: '/accounts', icon: <AccountBalanceIcon fontSize="small" /> },
      { label: 'Movimientos', to: '/transactions', icon: <ReceiptLongIcon fontSize="small" /> },
      { label: 'Planificación', to: '/planning', icon: <PieChartIcon fontSize="small" /> },
    ],
  },
  {
    group: 'Datos',
    items: [
      { label: 'Conexiones', to: '/bank-connections', icon: <LinkIcon fontSize="small" /> },
      { label: 'Importar', to: '/imports', icon: <UploadFileIcon fontSize="small" /> },
      { label: 'Categorías', to: '/categories', icon: <CategoryIcon fontSize="small" /> },
    ],
  },
];

interface SidebarProps {
  drawerWidth: number;
  mobileOpen: boolean;
  onClose: () => void;
}

function DrawerContent() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar sx={{ px: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            width: 32, height: 32, borderRadius: 2,
            background: 'linear-gradient(135deg, #6366f1 0%, #a78bfa 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <SavingsIcon sx={{ fontSize: 18, color: '#fff' }} />
          </Box>
          <Typography variant="subtitle1" fontWeight={700} sx={{
            background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Finanzas
          </Typography>
        </Box>
      </Toolbar>
      <Divider />
      <Box sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
        {NAV_GROUPS.map((group) => (
          <Box key={group.group} sx={{ mb: 1 }}>
            <Typography
              variant="caption"
              sx={{ px: 2.5, py: 0.5, display: 'block', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.disabled', fontSize: '0.65rem' }}
            >
              {group.group}
            </Typography>
            <List dense disablePadding>
              {group.items.map((item) => (
                <ListItem key={item.to} disablePadding sx={{ px: 1 }}>
                  <ListItemButton
                    component={NavLink}
                    to={item.to}
                    sx={{ borderRadius: 2, py: 0.75, gap: 0 }}
                  >
                    <ListItemIcon sx={{ minWidth: 34, color: 'text.secondary' }}>{item.icon}</ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default function Sidebar({ drawerWidth, mobileOpen, onClose }: SidebarProps) {
  return (
    <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
      {/* Mobile drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { width: drawerWidth },
        }}
      >
        <DrawerContent />
      </Drawer>
      {/* Desktop drawer */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box' },
        }}
        open
      >
        <DrawerContent />
      </Drawer>
    </Box>
  );
}
