import { jest } from '@jest/globals'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import type { Server } from 'node:http'
import request from 'supertest'
import {
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus'
import { HealthController } from '@/health/health.controller.js'
import { NotificationController } from '@/notification/notification.controller.js'
import { NotificationService } from '@/notification/notification.service.js'
import { NotificationStatus } from '@/generated/prisma/enums.js'
import { PrismaService } from '@/prisma/prisma.service.js'
import { GlobalExceptionFilter } from '@/common/filters/global-exception.filter.js'
import { RequestValidationException } from '@/common/exceptions/notification.exceptions.js'

describe('Notification API (e2e)', () => {
  let app: INestApplication
  let notificationService: { send: jest.Mock }
  let prisma: { notification: { findUnique: jest.Mock } }
  let healthCheck: { check: jest.Mock }

  beforeAll(async () => {
    notificationService = {
      send: jest.fn<() => Promise<any>>().mockResolvedValue({
        id: 'ntf_123',
        status: NotificationStatus.queued,
      }),
    }
    prisma = {
      notification: {
        findUnique: jest.fn<() => Promise<any>>().mockResolvedValue({
          id: 'ntf_123',
          status: NotificationStatus.sent,
          attempts: 1,
          providerMessageId: 'provider-1',
        }),
      },
    }
    healthCheck = {
      check: jest.fn<() => Promise<any>>().mockResolvedValue({
        status: 'ok',
        info: { memory_heap: { status: 'up' } },
        error: {},
        details: { memory_heap: { status: 'up' } },
      }),
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [HealthController, NotificationController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: healthCheck,
        },
        {
          provide: MemoryHealthIndicator,
          useValue: {
            checkHeap: jest
              .fn<() => Promise<any>>()
              .mockResolvedValue({ status: 'up' }),
          },
        },
        {
          provide: PrismaHealthIndicator,
          useValue: {
            pingCheck: jest.fn<() => any>().mockReturnValue({ status: 'up' }),
          },
        },
        {
          provide: NotificationService,
          useValue: notificationService,
        },
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile()

    app = moduleFixture.createNestApplication()
    app.setGlobalPrefix('api')
    app.useGlobalFilters(new GlobalExceptionFilter())
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: (errors) =>
          new RequestValidationException(
            errors.flatMap((error) => Object.values(error.constraints ?? {})),
          ),
      }),
    )
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('/api/health/live (GET) returns 200', () => {
    const server = app.getHttpServer() as Server
    return request(server).get('/api/health/live').expect(200)
  })

  it('/api/health/ready (GET) returns 200', () => {
    const server = app.getHttpServer() as Server
    return request(server).get('/api/health/ready').expect(200)
  })

  it('/api/notifications (POST) rejects missing Idempotency-Key', () => {
    const server = app.getHttpServer() as Server
    return request(server)
      .post('/api/notifications')
      .send({
        userId: 'user-1',
        channel: 'email',
        templateId: 'tpl-reminder',
        payload: { appointment: '2026-09-10' },
        legalBasis: 'treatment',
      })
      .expect(400)
      .expect((res) => {
        const body = res.body as {
          statusCode: number
          errorCode: string
          path: string
          method: string
          requestId: string
        }
        expect(body).toMatchObject({
          statusCode: 400,
          errorCode: 'IDEMPOTENCY_KEY_REQUIRED',
          path: '/api/notifications',
          method: 'POST',
        })
        expect(body.requestId).toEqual(expect.any(String))
      })
  })

  it('/api/notifications (POST) rejects invalid payloads with a normalized validation error body', () => {
    const server = app.getHttpServer() as Server
    return request(server)
      .post('/api/notifications')
      .set('Idempotency-Key', 'idem-invalid')
      .send({
        userId: 'user-1',
        channel: 'not-a-channel',
        payload: { appointment: '2026-09-10' },
        legalBasis: 'treatment',
      })
      .expect(400)
      .expect((res) => {
        const body = res.body as {
          statusCode: number
          errorCode: string
          message: string | string[]
        }
        expect(body).toMatchObject({
          statusCode: 400,
          errorCode: 'VALIDATION_FAILED',
        })
        expect(
          Array.isArray(body.message) || typeof body.message === 'string',
        ).toBe(true)
      })
  })

  it('/api/notifications (POST) accepts valid payloads with the idempotency header', () => {
    const server = app.getHttpServer() as Server
    return request(server)
      .post('/api/notifications')
      .set('Idempotency-Key', 'idem-123')
      .send({
        userId: 'user-1',
        channel: 'email',
        templateId: 'tpl-reminder',
        payload: { appointment: '2026-09-10' },
        legalBasis: 'treatment',
      })
      .expect(202)
      .expect(({ body }) => {
        expect(body).toEqual({
          id: 'ntf_123',
          status: NotificationStatus.queued,
        })
      })
  })

  it('/api/notifications/:id (GET) returns the saved notification status', () => {
    const server = app.getHttpServer() as Server
    return request(server)
      .get('/api/notifications/ntf_123')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          id: 'ntf_123',
          status: NotificationStatus.sent,
          attempts: 1,
          providerMessageId: 'provider-1',
        })
      })
  })

  it('/api/notifications/:id (GET) returns a normalized 404 error body when not found', () => {
    prisma.notification.findUnique.mockResolvedValueOnce(null as never)
    const server = app.getHttpServer() as Server
    return request(server)
      .get('/api/notifications/does-not-exist')
      .expect(404)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          statusCode: 404,
          errorCode: 'NOTIFICATION_NOT_FOUND',
          path: '/api/notifications/does-not-exist',
          method: 'GET',
        })
      })
  })
})
