import { Box, CircularProgress } from '@mui/material';

interface LoadingSpinnerProps {
  minHeight?: number | string;
}

export default function LoadingSpinner({ minHeight = 200 }: LoadingSpinnerProps) {
  return (
    <Box
      sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight }}
    >
      <CircularProgress />
    </Box>
  );
}
