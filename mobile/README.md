# Finanzas Personales Mobile

App Expo/React Native para usar el sistema desde iOS, Android o web.

## Ejecutar

```bash
cd mobile
EXPO_PUBLIC_API_URL=http://localhost:8000/api/v1 npm run ios
```

En un telefono fisico usa la IP local del Mac:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.50:8000/api/v1 npm run android
```

## Incluye

- Registro e inicio de sesion.
- Token guardado en `expo-secure-store`.
- Resumen del mes con saldo libre, gastos y ahorro sugerido.
- Registro rapido de ingresos y gastos.
- Presupuestos, cuentas y proyeccion mensual autenticadas por usuario.
