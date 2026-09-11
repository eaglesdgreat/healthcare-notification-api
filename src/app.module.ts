import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { LoggerModule } from 'nestjs-pino'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { AuditModule } from '@/audit/audit.module.js'
import configuration from '@/config/configuration.js'
import { MetricsModule } from '@/common/metrics/metrics.module.js'
import { HealthModule } from '@/health/health.module.js'
import { NotificationModule } from '@/notification/notification.module.js'
import { PrismaModule } from '@/prisma/prisma.module.js'
import { QueueModule } from '@/queue/queue.module.js'

/** Infrastructure traffic that must not produce noisy request logs. */
const EXCLUDED_REQUEST_LOG_PREFIXES = ['/api/health', '/api/metrics']

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          // Reuse the caller's x-request-id when present, otherwise mint one.
          genReqId: (req: IncomingMessage, res: ServerResponse) => {
            const header = req.headers['x-request-id']
            const id =
              typeof header === 'string' && header.length > 0
                ? header
                : randomUUID()
            res.setHeader('x-request-id', id)
            return id
          },
          customProps: (req: IncomingMessage) => ({
            requestId: (req as IncomingMessage & { id?: unknown }).id,
          }),
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
            ],
            censor: '[REDACTED]',
          },
          autoLogging: {
            ignore: (req: IncomingMessage) => {
              const url = req.url ?? ''
              return EXCLUDED_REQUEST_LOG_PREFIXES.some((prefix) =>
                url.startsWith(prefix),
              )
            },
          },
          // Pretty-print locally; emit JSON in production.
          ...(config.get('nodeEnv') === 'production'
            ? {}
            : {
                transport: {
                  target: 'pino-pretty',
                  options: { singleLine: true, colorize: true },
                },
              }),
        },
      }),
    }),
    PrismaModule,
    AuditModule,
    QueueModule,
    NotificationModule,
    HealthModule,
    MetricsModule,
  ],
})
export class AppModule {}
