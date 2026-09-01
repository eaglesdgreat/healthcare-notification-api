import { jest } from '@jest/globals'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@/generated/prisma/client.js'
import {
  LegalBasis,
  NotificationChannel,
  NotificationStatus,
} from '@/generated/prisma/enums.js'
import type { SendNotificationDto } from '@/notification/dto/send-notification.dto.js'
import { NotificationService } from '@/notification/notification.service.js'
import { PrismaService } from '@/prisma/prisma.service.js'

describe('NotificationService', () => {
  const dto: SendNotificationDto = {
    userId: 'user-1',
    channel: NotificationChannel.email,
    templateId: 'tpl-reminder',
    payload: { appointment: '2026-09-10T10:00:00Z' },
    legalBasis: LegalBasis.treatment,
  }

  let prisma: {
    notification: {
      findUnique: jest.MockedFunction<(args: any) => Promise<any>>
      create: jest.MockedFunction<(args: any) => Promise<any>>
    }
  }
  let config: { get: jest.MockedFunction<(key: string) => string> }
  let emailQueue: {
    add: jest.MockedFunction<
      (jobName: string, payload: any, options?: any) => Promise<any>
    >
  }
  let smsQueue: {
    add: jest.MockedFunction<
      (jobName: string, payload: any, options?: any) => Promise<any>
    >
  }
  let pushIosQueue: {
    add: jest.MockedFunction<
      (jobName: string, payload: any, options?: any) => Promise<any>
    >
  }
  let pushAndroidQueue: {
    add: jest.MockedFunction<
      (jobName: string, payload: any, options?: any) => Promise<any>
    >
  }
  let service: NotificationService

  beforeEach(() => {
    prisma = {
      notification: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    }
    config = { get: jest.fn<(key: string) => string>(() => 'US') }
    emailQueue = { add: jest.fn() }
    smsQueue = { add: jest.fn() }
    pushIosQueue = { add: jest.fn() }
    pushAndroidQueue = { add: jest.fn() }

    service = new NotificationService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      emailQueue as unknown as ConstructorParameters<
        typeof NotificationService
      >[2],
      smsQueue as unknown as ConstructorParameters<
        typeof NotificationService
      >[3],
      pushIosQueue as unknown as ConstructorParameters<
        typeof NotificationService
      >[4],
      pushAndroidQueue as unknown as ConstructorParameters<
        typeof NotificationService
      >[5],
    )
  })

  it('returns an existing notification for a duplicate idempotency key', async () => {
    const existing = { id: 'ntf_123', status: NotificationStatus.sent }
    prisma.notification.findUnique.mockResolvedValue(existing)

    await expect(service.send(dto, 'idem-123')).resolves.toEqual({
      id: 'ntf_123',
      status: NotificationStatus.sent,
    })
    expect(prisma.notification.create).not.toHaveBeenCalled()
  })

  it('creates a queued notification and enqueues it on the correct email queue', async () => {
    prisma.notification.findUnique.mockResolvedValue(null)
    prisma.notification.create.mockResolvedValue({
      id: 'ntf_456',
      status: NotificationStatus.queued,
    })
    emailQueue.add.mockResolvedValue({ id: 'job-1' })

    const result = await service.send(dto, 'idem-456')

    expect(result).toEqual({ id: 'ntf_456', status: NotificationStatus.queued })

    const createArgs = prisma.notification.create.mock.calls[0][0] as {
      data: {
        userId: string
        channel: NotificationChannel
        templateId: string
        legalBasis: LegalBasis
        region: string
        status: NotificationStatus
        dedupKey: string
      }
    }
    expect(createArgs.data).toMatchObject({
      userId: 'user-1',
      channel: NotificationChannel.email,
      templateId: 'tpl-reminder',
      legalBasis: LegalBasis.treatment,
      region: 'US',
      status: NotificationStatus.queued,
      dedupKey: 'idem-456',
    })

    const queueArgs = emailQueue.add.mock.calls[0] as [
      string,
      { notificationId: string },
      { jobId: string },
    ]
    expect(queueArgs[0]).toBe('send-notification')
    expect(queueArgs[1]).toEqual({ notificationId: 'ntf_456' })
    expect(queueArgs[2]).toMatchObject({ jobId: 'ntf_456' })
  })

  it('routes push notifications to the Android queue when the platform is Android', async () => {
    const pushAndroidDto: SendNotificationDto = {
      ...dto,
      channel: NotificationChannel.push,
      platform: 'android',
    }
    prisma.notification.findUnique.mockResolvedValue(null)
    prisma.notification.create.mockResolvedValue({
      id: 'ntf_push_android',
      status: NotificationStatus.queued,
    })

    await service.send(pushAndroidDto, 'idem-push-android')

    expect(pushAndroidQueue.add).toHaveBeenCalledTimes(1)
    expect(pushIosQueue.add).not.toHaveBeenCalled()
  })

  it('routes push notifications to the iOS queue when the platform is iOS', async () => {
    const pushIosDto: SendNotificationDto = {
      ...dto,
      channel: NotificationChannel.push,
      platform: 'ios',
    }
    prisma.notification.findUnique.mockResolvedValue(null)
    prisma.notification.create.mockResolvedValue({
      id: 'ntf_push_ios',
      status: NotificationStatus.queued,
    })

    await service.send(pushIosDto, 'idem-push-ios')

    expect(pushIosQueue.add).toHaveBeenCalledTimes(1)
    expect(pushAndroidQueue.add).not.toHaveBeenCalled()
  })

  it('returns the duplicate record when a unique-key race occurs during creation', async () => {
    const duplicateError = new Error('duplicate key')
    Object.assign(duplicateError, { code: 'P2002' })
    Object.setPrototypeOf(
      duplicateError,
      Prisma.PrismaClientKnownRequestError.prototype,
    )
    prisma.notification.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'ntf_duplicate',
        status: NotificationStatus.duplicate,
      })
    prisma.notification.create.mockRejectedValueOnce(duplicateError)

    await expect(service.send(dto, 'idem-race')).resolves.toEqual({
      id: 'ntf_duplicate',
      status: NotificationStatus.duplicate,
    })
  })
})
