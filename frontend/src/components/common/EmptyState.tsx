import { Box, Typography, SvgIconProps } from '@mui/material';
import InboxIcon from '@mui/icons-material/Inbox';

interface EmptyStateProps {
  message?: string;
  description?: string;
  Icon?: React.ComponentType<SvgIconProps>;
}

export default function EmptyState({
  message = 'Sin datos',
  description,
  Icon = InboxIcon,
}: EmptyStateProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 8,
        color: 'text.secondary',
      }}
    >
      <Icon sx={{ fontSize: 64, mb: 2, opacity: 0.4 }} />
      <Typography variant="h6" gutterBottom>
        {message}
      </Typography>
      {description && (
        <Typography variant="body2" textAlign="center" maxWidth={400}>
          {description}
        </Typography>
      )}
    </Box>
  );
}
