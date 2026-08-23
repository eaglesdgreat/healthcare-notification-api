# Healthcare Notification Service — System Design (Stage 1)

A standalone, multi-tenant notification microservice that lets other internal
services send **email, SMS, and push (iOS/Android)** notifications reliably,
with **HIPAA + GDPR** compliance across **US and EU** regions.

---

## 1. Overview

- **In scope (Stage 1):** transactional/triggered notifications (appointment
  reminders, results, care instructions, OTP), template rendering,
  preferences/consent, delivery status, idempotency, provider abstraction,
  retries/dead-letter, audit.
- **Out of scope (Stage 1):** marketing campaign orchestration, per-user
  digest/frequency-capping, user-facing preference portal, real-time chat.

## 2. Requirements

### Functional

- Send notifications via email, SMS, and push (FCM / APNs).
- Internal-only send API, accessible only by verified clients.
- Template rendering with variables; per-channel, versioned templates.
- Per-user, per-channel, per-type consent / opt-out enforcement.
- Idempotency — a retried request never sends twice.
- Delivery status tracking (`queued / processing / sent / failed / duplicate`).
- Pluggable third-party providers (swap SendGrid ↔ SES, Twilio ↔ Pinpoint)
  without code changes.

### Non-functional

- **Reliability:** at-least-once with dedup (no duplicate sends); no data loss
  on provider outage.
- **Availability:** 99.9%; one provider's outage must not affect other channels.
- **Latency:** API accepts and returns `202` in < 200 ms; delivery is async.
- **Compliance:** HIPAA + GDPR, data residency (EU data stays in EU, US in US).
- **Observability:** metrics, PHI-safe logs, distributed tracing, alerting.
- **Scalability:** API and workers scale horizontally and independently.

## 3. High-Level Architecture

```
                ┌──────────────────────────────────────────────────┐
                │        Other Internal Services (callers)         │
                │ appointments · patient portal · billing · admin  │
                └────────────────────────┬─────────────────────────┘
                                         │ REST (internal)
                                         │ Auth: API key / mTLS / OAuth2
                                         │ Header: Idempotency-Key
                ┌────────────────────────▼─────────────────────────┐
                │        Notification API (regional gateway)       │
                │ validate · resolve region/prefs/template · dedup │
                │ persist metadata · enqueue                       │
                └────────────────────────┬─────────────────────────┘
                                         │ region routing (EU vs US)
        ┌────────────────────────────────┴────────────────────────────────┐
        │                                                                 │
  ┌─────▼──────────────────────────────┐        ┌───────────────────────▼─────┐
  │        EU REGION (eu-central)       │        │       US REGION (us-east)    │
  │ ┌────────────┐  ┌────────────────┐  │        │ ┌────────────┐ ┌───────────┐ │
  │ │  Postgres  │  │     Redis      │  │        │ │  Postgres  │ │   Redis   │ │
  │ │ (metadata, │  │ (cache, dedup, │  │        │ │ (metadata, │ │ (cache,   │ │
  │ │  audit,    │  │  rate-limit)   │  │        │ │  audit,    │ │  dedup,   │ │
  │ │  tokens)   │  └────────────────┘  │        │ │  tokens)   │ │  rate-limit)│
  │ └────────────┘                       │        │ └────────────┘ └───────────┘ │
  │ ┌─────────────────────────────────┐  │        │ ┌──────────────────────────┐ │
  │ │ Message broker (per channel):   │  │        │ │ Message broker (per      │ │
  │ │  email · sms · push.ios ·       │  │        │ │  channel) + DLQ per      │ │
  │ │  push.android · DLQ.*           │  │        │ │  channel                  │ │
  │ └───────────────┬─────────────────┘  │        │ └───────────┬──────────────┘ │
  │ ┌───────────────▼─────────────────┐  │        │ ┌───────────▼──────────────┐ │
  │ │ Workers (retry/backoff, rate-   │  │        │ │ Workers (retry/backoff,  │ │
  │ │  limit, DLQ)                    │  │        │ │  rate-limit, DLQ)        │ │
  │ └───────────────┬─────────────────┘  │        │ └───────────┬──────────────┘ │
  │                 │ Provider adapters  │        │             │ Provider adapters│
  │  Email: SendGrid EU · SMS: Twilio   │        │  Email: SES · SMS: Twilio    │
  │  Push: FCM + APNs (DPF/SCC)         │        │  Push: FCM + APNs             │
  └──────────────────────────────────────┘        └──────────────────────────────┘
```

### End-to-end flow

1. Caller → `POST /v1/notifications` (with `Idempotency-Key`).
2. API validates payload/recipient, resolves region + preferences + template.
3. Dedup check (idempotency key); persist metadata row (`queued`); enqueue to
   the channel queue.
4. Worker pulls, renders template (content in memory only), calls provider.
5. Provider returns; worker updates status and publishes
   `notification.sent` / `notification.failed`.
6. Provider webhooks (delivery receipts) update the final status.

## 4. Component Design

- **Notification API (stateless):** validation (email/phone/device-token
  format), region resolution, preference/consent gate, dedup, metadata write,
  enqueue. Returns `202 { id, status }`.
- **Regional gateway:** the single entry point holds no PHI; it only routes to
  the correct regional instance by `user.region`. Each region's API/queue/DB is
  fully isolated.
- **Message broker:** Redis + BullMQ for Stage 1 (RabbitMQ/Kafka later if
  replay/ordering is needed). **One queue per channel** + one dead-letter queue
  per channel (blast-radius isolation).
- **Workers:** pull → render → send → update status. Exponential backoff +
  jitter, max attempts, dead-letter. Per-provider rate limiting.
- **Provider adapters (Strategy pattern):** `NotificationProvider` interface
  (`send()`, `getDeliveryStatus()`, `supports()`), resolved via
  `ProviderRegistry` by channel/platform. Plug/unplug via config.
- **Cache (Redis):** user/device/template data, dedup keys, rate-limit counters.
- **Database (Postgres, per region):** metadata, templates, consent, audit.

## 5. Data Model (per-region Postgres)

| Entity | Key fields |
| --- | --- |
| `User` | `id`, `region` (US/EU), `timezone`, `locale` |
| `UserChannel` | `userId`, `channel` (email/sms/push), `address`/`phone`, `deviceToken`, `platform` (ios/android), `verifiedAt` |
| `NotificationTemplate` | `id`, `channel`, `version`, `subject`/`body`, `variables`, `active` |
| `Notification` | `id`, `userId`, `channel`, `platform`, `templateId`, `payload`, `legalBasis`, `region`, `status`, `provider`, `providerMessageId`, `attempts`, `lastError`, `scheduledAt`, `sentAt`, `dedupKey` (**unique**) |
| `Consent` | `userId`, `channel`, `type`, `legalBasis`, `optedIn`, `consentedAt`, `proofHash` |
| `AuditLog` | append-only, tamper-evident; `actor`, `action`, `resourceId`, `status`, `region`, `metadata` — **pseudonymized** (IDs only, no PHI) |

> **PHI handling:** message content is rendered at send time and never
> persisted; identifiers are tokenized; `Notification.payload` holds template
> variables only (no PHI required).

## 6. API Contracts

```
POST /v1/notifications
  Headers:
    Authorization: Bearer <client-token>
    Idempotency-Key: <uuid>
  Body: {
    "userId": "usr_...",
    "channel": "email" | "sms" | "push",
    "platform": "ios" | "android",       // push only
    "templateId": "tpl_appt_reminder_v3",
    "payload": { "appt_time": "..." },    // template variables only
    "legalBasis": "treatment" | "consent" | "legal_obligation" | "legitimate_interest",
    "scheduledAt": "ISO-8601 (optional)"
  }
  202 → { "id": "ntf_...", "status": "queued" }
  409 → duplicate idempotency key already processed

GET /v1/notifications/:id → { id, status, attempts, providerMessageId }
```

**Outbound events** (published to the broker for other services):
`notification.queued` · `notification.sent` · `notification.failed` ·
`notification.delivered` (from provider webhooks) · `notification.opted_out`.

## 7. Inter-Service Communication

- **Inbound:** internal REST (JSON) now; gRPC optional later for hot paths.
  Auth via API key / mTLS / OAuth2 client-credentials ("verified clients").
- **Outbound:** async events on the broker (delivery status), so consumers
  react without polling.
- **Contracts:** versioned event schemas; `correlation_id` propagated
  end-to-end.
- **Anti-spam:** client rate limits + allow-listing; no public internet
  exposure.

## 8. Reliability & Scalability

- **At-least-once + idempotency/dedup** (`dedupKey` unique) → retries never
  duplicate.
- **Retry:** exponential backoff + jitter, max attempts (5), then dead-letter
  for manual replay.
- **Isolation:** per-channel queues + per-provider rate limits (respect
  SendGrid/Twilio limits).
- **Scaling:** API scales horizontally (stateless); workers scale per queue
  depth; DB via read replicas later (not needed at MVP scale).

## 9. Security & Compliance (HIPAA + GDPR, multi-region)

- **Residency:** EU data never leaves EU; US data never leaves US. Per-region
  KMS, DB, queues.
- **Encryption:** TLS 1.2+ in transit; envelope encryption (per-region KMS) +
  field-level AES-256 at rest.
- **Minimization:** render-and-send (don't persist message content); tokenize
  identifiers (email/phone/device tokens).
- **Consent/legal basis:** `treatment`/`legal_obligation` (no marketing consent
  needed) vs `consent` (explicit opt-in); opt-outs enforced pre-enqueue (email
  unsubscribe, SMS STOP, push prefs).
- **Contracts:** BAAs (HIPAA) + DPAs (GDPR) with all providers; SCCs / EU-US DPF
  for cross-border transfers (FCM/APNs are US — verify DPF participation).
- **Data-subject rights:** erasure (delete metadata + token mappings + provider
  suppression lists + device tokens), access/portability export.
- **Audit:** tamper-evident, pseudonymized append-only log; GDPR-bounded
  retention.
- **Process:** DPIA for health-data processing; DPO.

## 10. Observability

- **Metrics:** enqueue rate, queue depth, delivery latency, per-provider
  success/failure, retry/DLQ counts.
- **Tracing:** `correlation_id` through API → queue → worker → provider.
- **Logs:** redacted/pseudonymized (no PHI), bounded retention.
- **Alerts:** DLQ growth, provider error-rate spike, queue backlog,
  encryption-key access anomalies.

## 11. Testing Strategy

1. **Provider-failure test** — mock provider 503 → 503 → 200; assert exactly one
   dispatch, status `sent`, correct retry/backoff (the core reliability test).
2. **Provider mocks** for SendGrid (429/500/503), Twilio (avoid cost/fake
   numbers), FCM/APNs.
3. **Idempotency test** — same key twice → one row, one dispatch.
4. **Dead-letter test** — max retries → moved to DLQ, no further attempts.
5. **Consent/opt-out test** — opted-out user → rejected before enqueue.
6. **Erasure-propagation test** — GDPR delete removes metadata + tokens +
   provider suppression.
7. **Load test** — sustained enqueue → workers drain; p99 latency, no loss.
8. **Tools:** Vitest/Jest + Testcontainers (Postgres, Redis).

## 12. Deployment & Infrastructure

- **Per-region** containerized deployment (Docker → Kubernetes/ECS), separate
  config/keys per region.
- **IaC:** Terraform (per-region modules). **CI/CD:** build → test → per-region
  deploy.
- **Secrets/KMS:** per-region key management; secrets via a secrets manager.
- **MVP note:** region-parameterized from day one, but deploy **US first** and
  add **EU** when there are EU users (avoids two idle environments).

## 13. Stage 1 Roadmap

1. Repo scaffold: NestJS + TS + Postgres + Redis/BullMQ + Docker + region config.
2. Notification API + validation + idempotency + region/legal-basis fields.
3. Queue + worker skeleton with retry/backoff/DLQ.
4. Provider adapters: Email → SMS → Push, behind `NotificationProvider`.
5. Tokenization + envelope encryption + audit log.
6. Consent/preferences + opt-out enforcement.
7. Observability (metrics/tracing/alerts).
8. Test suite (provider-failure, idempotency, DLQ, consent, erasure).
9. Terraform for per-region deployment.

## 14. Tech Stack & Rationale

| Layer | Choice | Why |
| --- | --- | --- |
| Language/runtime | TypeScript + Node.js 20 LTS | Type-safe provider abstraction; matches Prisma/Testcontainers |
| Framework | NestJS 11 | Modules, DI, `@nestjs/microservices`/`@nestjs/bullmq` first-class |
| Queue | BullMQ on Redis 7 | Retry/backoff/DLQ built in; >1k jobs/sec at MVP scale |
| DB | PostgreSQL 16 + Prisma | Relational metadata; Prisma migrations + typed client |
| Validation | class-validator / class-transformer | Declarative DTO validation |
| Health | Terminus | Kubernetes liveness/readiness probes |
| Tooling | ESLint 9 + Prettier + Husky + lint-staged | Consistent, enforced quality gates |

**Alternative considered:** Go (better raw throughput for workers; more
boilerplate for the API/provider layer) — revisit if worker fan-out becomes the
bottleneck.

## 15. Assumptions & Open Questions

- **Scale:** sized for a startup MVP (< 100k notifications/day).
- **Cloud:** AWS/GCP (region names in diagrams are illustrative).
- **Push scope:** mobile push (FCM/APNs); in-app/web push deferred.
- **Open:** rate limiting (Throttler), provider SDK wiring (SendGrid/Twilio/FCM/
  APNs), consent portal, DLQ replay UI, and the regional routing gateway are
  Stage 1 follow-ups.



