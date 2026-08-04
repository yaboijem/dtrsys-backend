# DTR Portal

A React + Vite web app for the Daily Time Record (DTR) employee portal. Employees can clock in/out with selfie and GPS verification, view attendance history, manage notifications, and control privacy consents.

## Getting started

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

The dev server starts on `http://localhost:5173` by default.

## API proxy

During development, API calls under `/api` are proxied to the backend at:

```
http://192.168.100.158:8000
```

This is configured in `vite.config.ts`.

## Available scripts

- `npm run dev` — start the Vite dev server
- `npm run build` — typecheck and build for production
- `npm run typecheck` — run TypeScript with no emit
- `npm run preview` — preview the production build
