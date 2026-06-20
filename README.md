# Finanzas Personales

Aplicacion web full stack para administrar finanzas personales: cuentas, transacciones, presupuestos, objetivos, proyecciones, importacion de cartolas y sincronizacion bancaria local.

## Stack

- Backend: FastAPI + SQLModel + SQLite
- Frontend: React + TypeScript + Vite + MUI
- Motor financiero: reglas locales, dashboard y proyecciones
- Integraciones: importacion Excel/PDF y scrapers bancarios con Playwright

## Estructura

- backend/: API, modelos, servicios, scrapers, seeds y tests
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
- `SCRAPER_ENCRYPTION_KEY`: clave Fernet para cifrar credenciales bancarias locales
- `SCRAPER_HEADLESS`: `false` abre navegador visible, recomendado para bancos con desafio anti-bot
- `SCRAPER_DEBUG_DIR`: carpeta local para snapshots HTML/PNG cuando falla un scraper
- `SCRAPER_PROFILES_DIR`: carpeta local para perfiles persistentes de navegador
- `BANK_AUTO_SYNC_ENABLED`: activa/desactiva sincronizacion bancaria en segundo plano

## Sincronizacion bancaria local

Los bancos se conectan mediante scrapers Playwright. Las credenciales se guardan cifradas en la base SQLite local, por eso debes definir `SCRAPER_ENCRYPTION_KEY` antes de crear conexiones bancarias.

```bash
cd backend
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Luego agrega la clave a `backend/.env`:

```bash
SCRAPER_ENCRYPTION_KEY=<clave_generada>
```

BCI puede requerir navegador visible para resolver Cloudflare una vez:

```bash
SCRAPER_HEADLESS=false
BANK_AUTO_SYNC_ENABLED=false
```

Fintoc queda solo como historico legado: las conexiones nuevas se crean con proveedor bancario directo.

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
- robustecer scrapers adicionales con fixtures por banco
- despliegue en contenedores
