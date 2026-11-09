# Agente de Órdenes de Compra SAP

## Ejecución

```bash
bun install
bun run dev
```

Abre `http://localhost:3000`. No se requiere clave para el flujo determinista incluido. Para un proveedor LLM futuro, define sus variables en `.env` desde `.env.example`; las herramientas y el demo no leen claves.

## Demo

```bash
bun run demo.ts
```

Procesa los seis casos de `solicitudes/`, prueba idempotencia y confirma `sol-004` explícitamente.

## API

- `POST /api/chat`: `{ sessionId, message }` devuelve `{ reply, toolCalls, needsConfirmation }`.
- `GET /api/sessions/:id`: historial de la sesión.
- `GET /api/health`: estado sin secretos.

El despliegue público depende del proveedor elegido por quien entrega el reto.
