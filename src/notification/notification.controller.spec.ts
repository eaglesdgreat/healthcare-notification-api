import { jest } from '@jest/globals'
import { Logger } from '@nestjs/common'
import { NotificationStatus } from '@/generated/prisma/enums.js'
import { PrismaService } from '@/prisma/prisma.service.js'
import {
  IdempotencyKeyRequiredException,
  NotificationNotFoundException,
} from '@/common/exceptions/notification.exceptions.js'
import { NotificationController } from '@/notification/notification.controller.js'
import { SendNotificationDto } from '@/notification/dto/send-notification.dto.js'
import { NotificationService } from '@/notification/notification.service.js'

describe('NotificationController', () => {
  let controller: NotificationController
  let notificationService: {
    send: jest.MockedFunction<
      (dto: any, idempotencyKey?: string) => Promise<any>
    >
  }
  let prisma: {
    notification: {
      findUnique: jest.MockedFunction<(args: any) => Promise<any>>
    }
  }
  let logSpy: jest.SpiedFunction<typeof Logger.prototype.log>

  beforeEach(() => {
    notificationService = { send: jest.fn() }
    prisma = { notification: { findUnique: jest.fn() } }
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined)
    controller = new NotificationController(
      notificationService as unknown as NotificationService,
      prisma as unknown as PrismaService,
    )
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('rejects requests that do not include the Idempotency-Key header', () => {
    const dto: SendNotificationDto = {
      userId: 'user-1',
      channel: 'email',
      templateId: 'tpl-reminder',
      payload: { appointment: '2026-09-10' },
      legalBasis: 'treatment',
    }

    expect(() => controller.send(dto)).toThrow(IdempotencyKeyRequiredException)
    expect(notificationService.send).not.toHaveBeenCalled()
  })

  it('delegates send requests to the notification service when a key is provided', async () => {
    const dto: SendNotificationDto = {
      userId: 'user-1',
      channel: 'email',
      templateId: 'tpl-reminder',
      payload: { appointment: '2026-09-10' },
      legalBasis: 'treatment',
    }
    const result = { id: 'ntf_123', status: NotificationStatus.queued }

    notificationService.send.mockResolvedValue(result)

    await expect(
      controller.send(dto, 'idem-123', { id: 'req-123' } as never),
    ).resolves.toEqual(result)
    expect(notificationService.send).toHaveBeenCalledWith(
      dto,
      'idem-123',
      'req-123',
    )
  })

  it('returns the existing notification record for a valid id', async () => {
    const record = {
      id: 'ntf_123',
      status: NotificationStatus.sent,
      attempts: 2,
      providerMessageId: 'provider-456',
    }

    prisma.notification.findUnique.mockResolvedValue(record)

    await expect(
      controller.getStatus('ntf_123', { id: 'req-123' } as never),
    ).resolves.toEqual(record)
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'notification.status.read',
        notificationId: 'ntf_123',
        status: NotificationStatus.sent,
        requestId: 'req-123',
        message: 'Notification status retrieved',
      }),
    )
    expect(prisma.notification.findUnique).toHaveBeenCalledWith({
      where: { id: 'ntf_123' },
      select: {
        id: true,
        status: true,
        attempts: true,
        providerMessageId: true,
      },
    })
  })

  it('throws a not found exception when status is requested for a missing notification', async () => {
    prisma.notification.findUnique.mockResolvedValue(null)

    await expect(controller.getStatus('missing-id')).rejects.toThrow(
      NotificationNotFoundException,
    )
  })
})
