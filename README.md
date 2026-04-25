# Finanzas Personales - Agente Financiero

Aplicacion web full stack para administracion de finanzas personales con analisis inteligente.

## Stack

- Backend: FastAPI + SQLModel + SQLite
- Frontend: React + TypeScript + Vite + MUI
- IA: motor de reglas + proveedor LLM (mock u OpenAI)
- Integraciones: importacion Excel/PDF y arquitectura para Fintoc

## Estructura

- backend/: API, modelos, servicios, seeds
- frontend/: app React, paginas, componentes y cliente API

## Requisitos

- Python 3.11+
- Node.js 18+
- npm 9+

## Instalacion rapida

```bash
./install.sh
```

## Ejecutar en desarrollo

```bash
./start.sh
```

Servicios:

- Backend: http://localhost:8000
- Swagger: http://localhost:8000/docs
- Frontend: http://localhost:5173

## Configuracion backend

1. Crear archivo de entorno:

```bash
cp backend/.env.example backend/.env
```

2. Variables importantes:

- `DATABASE_URL`: por defecto SQLite local
- `SEED_ON_STARTUP`: `false` para iniciar limpio desde cero, `true` para cargar datos demo
- `LLM_PROVIDER`: `mock`, `openai` o `ollama`
- `OPENAI_API_KEY`: requerido si `LLM_PROVIDER=openai`
- `OLLAMA_BASE_URL` y `OLLAMA_MODEL`: usados si `LLM_PROVIDER=ollama`
- `FINTOC_SECRET_KEY`: opcional para integracion real

## Agente real con Ollama (local)

1. Instala Ollama y levanta el servicio:

```bash
ollama serve
```

2. Descarga un modelo recomendado:

```bash
ollama pull llama3.1:8b
```

3. En `backend/.env`:

```bash
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
```

Con esto, el endpoint del agente (`/api/v1/agent/analyze` y `/api/v1/agent/chat`) usa el modelo local.

## Resumen mensual consolidado de cartolas

Si cargas varias cartolas para un mismo mes, puedes obtener un resumen consolidado con:

```bash
GET /api/v1/imports/monthly-summary?month=4&year=2026&account_id=1
```

Incluye:

- cantidad de archivos importados en el periodo
- total de transacciones del mes (de cartolas importadas)
- ingresos, gastos y ahorro
- tasa de categorizacion y transacciones sin categoria
- top categorias de gasto
- gastos hormiga (cantidad y monto)

## Datos de demo

Al iniciar backend por primera vez se ejecutan seeds automaticamente:

- categorias con subcategorias
- cuentas de ejemplo
- transacciones de dos meses
- gastos fijos, objetivos y presupuestos

## Scripts manuales

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Roadmap sugerido

- autenticacion y multiusuario
- motor de reglas configurable por usuario
- sincronizacion real bancaria con webhooks
- despliegue en contenedores
