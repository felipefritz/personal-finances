import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stepper,
  Step,
  StepLabel,
  Typography,
  Box,
  Chip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

const ONBOARDING_COMPLETED_KEY = 'fp.onboarding.completed';
const ONBOARDING_DISMISSED_KEY = 'fp.onboarding.dismissed';

const STEPS = [
  {
    title: 'Conecta tu banco',
    description:
      'Comienza enlazando tu banco para traer movimientos en forma automática y validar la conexión.',
    ctaLabel: 'Ir a Conexiones',
    path: '/bank-connections',
  },
  {
    title: 'Agrega tus cuentas',
    description:
      'Crea o revisa tus cuentas para separar gastos por tarjeta, banco o tipo de cuenta.',
    ctaLabel: 'Ir a Cuentas',
    path: '/accounts',
  },
  {
    title: 'Define categorías',
    description:
      'Configura categorías para que el sistema clasifique mejor los movimientos y entregue análisis útiles.',
    ctaLabel: 'Ir a Categorías',
    path: '/categories',
  },
  {
    title: 'Importa estados de cuenta',
    description:
      'Sube uno o varios estados de cuenta del mismo mes para consolidar tu información financiera.',
    ctaLabel: 'Ir a Importar',
    path: '/imports',
  },
  {
    title: 'Revisa tu mes',
    description:
      'Consulta el inicio y la proyección para ver alertas, meses ajustados y recomendaciones accionables.',
    ctaLabel: 'Ir a Inicio',
    path: '/dashboard',
  },
];

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [open, setOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    const completed = localStorage.getItem(ONBOARDING_COMPLETED_KEY) === 'true';
    const dismissed = localStorage.getItem(ONBOARDING_DISMISSED_KEY) === 'true';

    setIsCompleted(completed);

    if (!completed && !dismissed) {
      const timer = window.setTimeout(() => setOpen(true), 500);
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, []);

  const currentStep = useMemo(() => STEPS[activeStep], [activeStep]);

  const handleOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    if (!isCompleted) {
      localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true');
    }
    setOpen(false);
  };

  const handleNavigateToStep = () => {
    navigate(currentStep.path);
    setOpen(false);
  };

  const handleNext = () => {
    if (activeStep === STEPS.length - 1) {
      localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
      localStorage.removeItem(ONBOARDING_DISMISSED_KEY);
      setIsCompleted(true);
      setOpen(false);
      return;
    }

    setActiveStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setActiveStep((prev) => Math.max(0, prev - 1));
  };

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        startIcon={<AutoAwesomeIcon />}
        onClick={handleOpen}
        sx={{ mr: 2, whiteSpace: 'nowrap' }}
      >
        Guia inicial
      </Button>
      {!isCompleted && (
        <Chip
          size="small"
          label="Nuevo"
          color="primary"
          sx={{ mr: 2, display: { xs: 'none', md: 'inline-flex' } }}
        />
      )}

      <Dialog
        open={open}
        onClose={handleClose}
        fullWidth
        maxWidth="md"
        fullScreen={isMobile}
      >
        <DialogTitle>Asistente inicial</DialogTitle>
        <DialogContent>
          <Stepper
            activeStep={activeStep}
            orientation={isMobile ? 'vertical' : 'horizontal'}
            sx={{ mb: 3 }}
          >
            {STEPS.map((step) => (
              <Step key={step.title}>
                <StepLabel>{step.title}</StepLabel>
              </Step>
            ))}
          </Stepper>

          <Box sx={{ p: 1 }}>
            <Typography variant="h6" gutterBottom>
              {currentStep.title}
            </Typography>
            <Typography color="text.secondary">{currentStep.description}</Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose}>Cerrar</Button>
          <Button onClick={handleNavigateToStep}>{currentStep.ctaLabel}</Button>
          <Box sx={{ flexGrow: 1 }} />
          <Button onClick={handleBack} disabled={activeStep === 0}>
            Atras
          </Button>
          <Button variant="contained" onClick={handleNext}>
            {activeStep === STEPS.length - 1 ? 'Finalizar' : 'Siguiente'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
