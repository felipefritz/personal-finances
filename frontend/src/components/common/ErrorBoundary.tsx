import React from 'react';
import { Box, Button, Typography } from '@mui/material';

interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error?.message || 'Error inesperado' };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Keep logging for debugging without crashing whole app tree.
    // eslint-disable-next-line no-console
    console.error('UI ErrorBoundary', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3 }}>
          <Box sx={{ textAlign: 'center', maxWidth: 560 }}>
            <Typography variant="h5" fontWeight={700} gutterBottom>
              Ocurrio un error en la interfaz
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              {this.state.message || 'La pantalla falló. Puedes recargar e intentar nuevamente.'}
            </Typography>
            <Button variant="contained" onClick={this.handleReload}>
              Recargar aplicacion
            </Button>
          </Box>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
