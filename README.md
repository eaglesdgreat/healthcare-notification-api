# Healthcare Notification API

Multi-channel notification service (email, SMS, push) for a healthcare platform.
Built with **NestJS + TypeScript**, designed for **HIPAA + GDPR** compliance
across **US/EU** regions.

> Stage 1 scaffold — see [`NOTIF_DESIGN.md`](./NOTIF_DESIGN.md) for the full
> system design.

## Stack

- **NestJS 11** (TypeScript, ESM)
- **BullMQ** + Redis for queues/workers (retry, exponential backoff, dead-letter)
- **Prisma** + PostgreSQL
- **class-validator** for request validation
- **Terminus** for liveness/readiness probes
- **Pino** (via `nestjs-pino`) for structured JSON logging
- **prom-client** for Prometheus metrics

## Getting started

```bash
# 1. install dependencies
pnpm install

# 2. configure (copy and adjust)
cp .env.example .env

# 3. start Postgres + Redis
docker compose up -d

# 4. generate the Prisma client + apply migrations
pnpm prisma:generate
pnpm prisma:migrate

# 5. run
pnpm start:dev
```

## Scripts

| Command                        | Description                              |
| ------------------------------ | ---------------------------------------- |
| `pnpm start:dev`               | Run in watch mode                        |
| `pnpm build`                   | Production build                         |
| `pnpm typecheck`               | TypeScript check (no emit)               |
| `pnpm lint` / `lint:fix`       | ESLint (check / autofix)                 |
| `pnpm format` / `format:check` | Prettier (write / check)                 |
| `pnpm test`                    | Unit tests                               |
| `pnpm test:e2e`                | e2e tests (requires `docker compose up`) |
| `pnpm prisma:migrate`          | Create/apply Prisma migrations           |
| `pnpm prisma:studio`           | Open Prisma Studio                       |

## API

| Method | Path                     | Description                              |
| ------ | ------------------------ | ---------------------------------------- |
| POST   | `/api/notifications`     | Enqueue a notification (Idempotency-Key) |
| GET    | `/api/notifications/:id` | Delivery status                          |
| GET    | `/api/health/live`       | Liveness probe                           |
| GET    | `/api/health/ready`      | Readiness probe (checks DB)              |
| GET    | `/api/metrics`           | Prometheus metrics                       |

Example:

```bash
curl -X POST http://localhost:3000/api/notifications \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 6f2b3c8e-9b1a-4f0a-8d2e-1a2b3c4d5e6f" \
  -d '{
    "userId": "user-1",
    "channel": "email",
    "templateId": "tpl-appt-reminder",
    "payload": { "appt_time": "2026-08-22T10:00:00Z" },
    "legalBasis": "treatment"
  }'
```

## Structure

```
src/
  config/         region-aware configuration
  prisma/         Prisma client + module
  notification/   API controller, DTOs, service
  queue/          BullMQ queues, processors, worker service
  providers/      provider adapters (email / sms / push)
  audit/          PHI-safe audit log
  health/         liveness/readiness probes
  common/         structured logging, Prometheus metrics, global error handling
prisma/
  schema.prisma   data model
```

## Observability and diagnostics

This service emits structured Pino logs and Prometheus metrics so it can be
operated consistently with the other healthcare microservices. Every request is
assigned a correlation ID (`x-request-id`) — reused from the caller-supplied
value when present — which is returned to callers and included in each log line.
Authorization headers, cookies, and notification payload bodies (which may
contain PHI) are redacted before a log is emitted.

| Endpoint                | Authentication                                   | Purpose                                                                                                                                 |
| ----------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health/live`  | Public                                           | Liveness probe. Verifies the process and heap memory are within limits.                                                                 |
| `GET /api/health/ready` | Public                                           | Readiness probe. Verifies PostgreSQL connectivity via Prisma. Returns `200` only when the instance can accept traffic; `503` otherwise. |
| `GET /api/metrics`      | Public; restrict it at the gateway/network layer | Prometheus text-format metrics for service/process health, HTTP request count/latency, and notification enqueue/delivery outcomes.      |

A healthy readiness response is:

```json
{
  "status": "ok",
  "info": { "database": { "status": "up" } },
  "error": {},
  "details": {}
}
```

All HTTP failures use a common response envelope. Keep the `requestId` when
escalating an issue; it links the client-visible error to the structured logs.

```json
{
  "type": "Bad Request",
  "statusCode": 400,
  "timestamp": "2026-09-09T10:15:30.000Z",
  "path": "/api/notifications",
  "requestId": "7a1b2c3d-4e5f-6789-abcd-ef0123456789",
  "response": {
    "message": "Idempotency-Key header is required",
    "statusCode": 400
  }
}
```

Do not expose `/api/metrics` directly to the public internet in production.
Permit only the Prometheus scraper or the private service network to access it.

## Git hooks (Husky + lint-staged)

- `pre-commit` — ESLint + Prettier on staged files
- `pre-push` — `pnpm typecheck`

## Provider adapters

Providers implement `NotificationProvider` and are resolved by channel/platform
at send time via `ProviderRegistry`. A `console` provider is wired by default
for local development. Reference implementations are provided for SendGrid
(email), Twilio (SMS), FCM (Android push), and APNs (iOS push) — see
`src/providers/`.
