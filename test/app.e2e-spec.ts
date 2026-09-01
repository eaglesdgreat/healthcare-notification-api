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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
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
})
