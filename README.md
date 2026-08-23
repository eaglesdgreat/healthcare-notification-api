# Healthcare Notification API

Multi-channel notification service (email, SMS, push) for a healthcare platform.
Built with **NestJS + TypeScript**, designed for **HIPAA + GDPR** compliance
across **US/EU** regions.

> Stage 1 scaffold — see [`NOTIF_DESIGN.md`](./NOTIF_DESIGN.md) for the full
> system design.

## Stack

- **NestJS 11** (TypeScript)
- **BullMQ** + Redis for queues/workers (retry, exponential backoff, dead-letter)
- **Prisma** + PostgreSQL
- **class-validator** for request validation
- **Terminus** for liveness/readiness probes

## Getting started

```bash
# 1. install dependencies
npm install

# 2. configure (copy and adjust)
cp .env.example .env

# 3. start Postgres + Redis
docker compose up -d

# 4. generate the Prisma client + apply migrations
npm run prisma:generate
npm run prisma:migrate

# 5. run
npm run start:dev
```

## Scripts

| Command                   | Description                            |
| ------------------------- | -------------------------------------- |
| `npm run start:dev`       | Run in watch mode                      |
| `npm run build`           | Production build                       |
| `npm run typecheck`       | TypeScript check (no emit)             |
| `npm run lint` / `lint:fix` | ESLint (check / autofix)             |
| `npm run format` / `format:check` | Prettier (write / check)       |
| `npm test`                | Unit tests                             |
| `npm run test:e2e`        | e2e tests (requires `docker compose up`) |
| `npm run prisma:migrate`  | Create/apply Prisma migrations         |
| `npm run prisma:studio`   | Open Prisma Studio                     |

## API

| Method | Path                       | Description                                  |
| ------ | -------------------------- | -------------------------------------------- |
| POST   | `/api/notifications`       | Enqueue a notification (Idempotency-Key)     |
| GET    | `/api/notifications/:id`   | Delivery status                              |
| GET    | `/api/health/live`         | Liveness probe                               |
| GET    | `/api/health/ready`        | Readiness probe (checks DB)                  |

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
prisma/
  schema.prisma   data model
```

## Git hooks (Husky + lint-staged)

- `pre-commit` — ESLint + Prettier on staged files
- `pre-push` — `npm run typecheck`

## Provider adapters

Providers implement `NotificationProvider` and are resolved by channel/platform
at send time via `ProviderRegistry`. A `console` provider is wired by default
for local development. Reference implementations are provided for SendGrid
(email), Twilio (SMS), FCM (Android push), and APNs (iOS push) — see
`src/providers/`.
