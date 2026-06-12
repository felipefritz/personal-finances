import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Box } from '@mui/material';
import Sidebar from './Sidebar';
import Header from './Header';
import FinancialPulse from './FinancialPulse';

const DRAWER_WIDTH = 240;

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Sidebar
        drawerWidth={DRAWER_WIDTH}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        <Header onMenuClick={() => setMobileOpen(true)} />
        <FinancialPulse />
        <Box sx={{ flexGrow: 1, p: { xs: 2, sm: 2.5, md: 3 }, overflowY: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
