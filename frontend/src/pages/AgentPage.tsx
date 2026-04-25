import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Stack,
  Alert,
  TextField,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import { getAgentAnalysis, chatWithAgent } from '../api/agent';
import { formatPercent } from '../utils/formatters';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function AgentPage() {
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState<ChatMessage[]>([]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['agent-analysis'],
    queryFn: () => getAgentAnalysis(),
  });

  const chatMut = useMutation({
    mutationFn: (msg: string) => chatWithAgent(msg),
    onSuccess: (res, msg) => {
      setChat((prev) => [...prev, { role: 'user', content: msg }, { role: 'assistant', content: res.response }]);
      setMessage('');
    },
  });

  const send = () => {
    const text = message.trim();
    if (!text || chatMut.isPending) return;
    chatMut.mutate(text);
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <Box>
      <PageHeader
        title="Agente Financiero IA"
        subtitle="Análisis automático de salud financiera y recomendaciones"
      />

      {isError || !data ? (
        <Alert severity="error">No se pudo cargar el análisis del agente.</Alert>
      ) : (
        <Grid container spacing={2} mb={2}>
          <Grid item xs={12} md={4}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight={700}>Resumen</Typography>
                <Stack spacing={1} mt={1}>
                  <Typography variant="body2">Ahorro: {formatPercent(data.financial_data.savings_percent)}</Typography>
                  <Typography variant="body2">Ingreso: {data.financial_data.income.toLocaleString('es-CL')}</Typography>
                  <Typography variant="body2">Gasto: {data.financial_data.expenses.toLocaleString('es-CL')}</Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={8}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>Recomendaciones</Typography>
                <Stack direction="row" gap={1} flexWrap="wrap" mb={2}>
                  {data.recommendations.map((r, i) => (
                    <Chip
                      key={i}
                      label={r.title}
                      color={r.type === 'danger' ? 'error' : r.type === 'warning' ? 'warning' : r.type === 'success' ? 'success' : 'info'}
                      variant="outlined"
                    />
                  ))}
                </Stack>
                <List dense disablePadding>
                  {data.recommendations.map((r, i) => (
                    <Box key={i}>
                      <ListItem disableGutters>
                        <ListItemText
                          primary={r.title}
                          secondary={r.message}
                        />
                      </ListItem>
                      {i < data.recommendations.length - 1 && <Divider />}
                    </Box>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            Chat con el Agente
          </Typography>

          <Box
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              p: 1,
              mb: 1.5,
              maxHeight: 320,
              overflowY: 'auto',
              bgcolor: 'background.default',
            }}
          >
            {chat.length === 0 ? (
              <Typography color="text.secondary" variant="body2" sx={{ p: 2 }}>
                Pregunta por tus gastos, ahorros o recomendaciones para este mes.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {chat.map((m, i) => (
                  <Box
                    key={i}
                    sx={{
                      display: 'flex',
                      gap: 1,
                      alignItems: 'flex-start',
                      justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    {m.role === 'assistant' && <SmartToyIcon fontSize="small" color="primary" />}
                    <Box
                      sx={{
                        px: 1.5,
                        py: 1,
                        borderRadius: 2,
                        maxWidth: '80%',
                        bgcolor: m.role === 'user' ? 'primary.main' : 'grey.100',
                        color: m.role === 'user' ? 'primary.contrastText' : 'text.primary',
                      }}
                    >
                      <Typography variant="body2">{m.content}</Typography>
                    </Box>
                    {m.role === 'user' && <PersonIcon fontSize="small" color="action" />}
                  </Box>
                ))}
              </Stack>
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Ej: ¿Cómo puedo reducir mis gastos fijos este mes?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            />
            <IconButton color="primary" onClick={send} disabled={chatMut.isPending || !message.trim()}>
              <SendIcon />
            </IconButton>
          </Box>
          {chatMut.isError && <Alert severity="error" sx={{ mt: 1 }}>Error al consultar al agente.</Alert>}
        </CardContent>
      </Card>
    </Box>
  );
}
