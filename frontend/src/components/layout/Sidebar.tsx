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
import RepeatIcon from '@mui/icons-material/Repeat';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import SavingsIcon from '@mui/icons-material/Savings';
import PieChartIcon from '@mui/icons-material/PieChart';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import LinkIcon from '@mui/icons-material/Link';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';

const NAV_ITEMS = [
  { label: 'Dashboard', to: '/dashboard', icon: <DashboardIcon /> },
  { label: 'Cuentas', to: '/accounts', icon: <AccountBalanceIcon /> },
  { label: 'Movimientos', to: '/transactions', icon: <ReceiptLongIcon /> },
  { label: 'Categorías', to: '/categories', icon: <CategoryIcon /> },
  { label: 'Gastos Fijos', to: '/fixed-expenses', icon: <RepeatIcon /> },
    { label: 'Ingresos Recurrentes', to: '/recurring-incomes', icon: <TrendingUpIcon /> },
  { label: 'Presupuestos', to: '/budgets', icon: <PieChartIcon /> },
  { label: 'Objetivos', to: '/savings-goals', icon: <SavingsIcon /> },
  { label: 'Proyección Anual', to: '/proyeccion', icon: <CalendarMonthIcon /> },
  { label: 'Importar', to: '/imports', icon: <UploadFileIcon /> },
  { label: 'Agente IA', to: '/agent', icon: <SmartToyIcon /> },
  { label: 'Conexiones', to: '/bank-connections', icon: <LinkIcon /> },
];

interface SidebarProps {
  drawerWidth: number;
  mobileOpen: boolean;
  onClose: () => void;
}

function DrawerContent() {
  return (
    <>
      <Toolbar>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SavingsIcon color="primary" />
          <Typography variant="h6" fontWeight={700} color="primary">
            Finanzas
          </Typography>
        </Box>
      </Toolbar>
      <Divider />
      <List dense>
        {NAV_ITEMS.map((item) => (
          <ListItem key={item.to} disablePadding>
            <ListItemButton
              component={NavLink}
              to={item.to}
              sx={{
                borderRadius: 1,
                mx: 1,
                '&.active': {
                  bgcolor: 'primary.light',
                  color: 'primary.contrastText',
                  '& .MuiListItemIcon-root': { color: 'primary.contrastText' },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </>
  );
}

export default function Sidebar({ drawerWidth, mobileOpen, onClose }: SidebarProps) {
  return (
    <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}>
      {/* Mobile drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', sm: 'none' },
          '& .MuiDrawer-paper': { width: drawerWidth },
        }}
      >
        <DrawerContent />
      </Drawer>
      {/* Desktop drawer */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', sm: 'block' },
          '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box' },
        }}
        open
      >
        <DrawerContent />
      </Drawer>
    </Box>
  );
}
