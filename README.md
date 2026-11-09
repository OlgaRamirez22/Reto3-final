# Agente de Órdenes de Compra SAP

## Ejecución

```bash
bun install
bun run dev
```

Abre `http://localhost:3000`. No se requiere clave para el flujo determinista. Para usar OpenAI, define `LLM_PROVIDER=openai`, `OPENAI_API_KEY` y `OPENAI_MODEL` solo en el backend; la clave no se expone al navegador, logs ni respuestas API.

## Demo

```bash
bun run demo.ts
```

Procesa los seis casos de `solicitudes/`, prueba idempotencia y confirma `sol-004` explícitamente.

## Pruebas

```bash
bun run test
bun run typecheck
bun run lint
```

## Despliegue

El repositorio incluye `Dockerfile`. En Render, Railway o Fly.io crea un servicio Docker desde este repositorio y configura las variables de `.env.example`; no publiques `OPENAI_API_KEY`. La URL pública que entregue la plataforma se registra en esta sección antes de la defensa.

## API

- `POST /api/chat`: `{ sessionId, message }` devuelve `{ reply, toolCalls, needsConfirmation }`.
- `GET /api/sessions/:id`: historial de la sesión.
- `GET /api/health`: estado sin secretos.

El despliegue público depende del proveedor elegido por quien entrega el reto.
