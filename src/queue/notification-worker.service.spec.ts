import { jest } from '@jest/globals'
import {
  NotificationChannel,
  NotificationStatus,
} from '@/generated/prisma/enums.js'
import { AuditService } from '@/audit/audit.service.js'
import { PrismaService } from '@/prisma/prisma.service.js'
import { ProviderRegistry } from '@/providers/provider-registry.service.js'
import {
  ProviderUnavailableException,
  RecipientNotFoundException,
} from '@/common/exceptions/notification.exceptions.js'
import { NotificationWorkerService } from '@/queue/notification-worker.service.js'

describe('NotificationWorkerService', () => {
  let prisma: {
    notification: {
      findUnique: jest.MockedFunction<(args: any) => Promise<any>>
      update: jest.MockedFunction<(args: any) => Promise<any>>
    }
    userChannel: {
      findFirst: jest.MockedFunction<(args: any) => Promise<any>>
    }
  }
  let providers: {
    resolve: jest.MockedFunction<(channel: any, platform?: any) => any>
  }
  let audit: { record: jest.MockedFunction<(args: any) => Promise<any>> }
  let service: NotificationWorkerService

  beforeEach(() => {
    prisma = {
      notification: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      userChannel: {
        findFirst: jest.fn(),
      },
    }
    providers = { resolve: jest.fn() }
    audit = { record: jest.fn() }
    service = new NotificationWorkerService(
      prisma as unknown as PrismaService,
      providers as unknown as ProviderRegistry,
      audit as unknown as AuditService,
    )
  })

  it('throws when the notification is missing', async () => {
    prisma.notification.findUnique.mockResolvedValue(null)

    await expect(service.process('missing-id')).rejects.toThrow(
      'Notification missing-id not found',
    )
    expect(prisma.notification.update).not.toHaveBeenCalled()
  })

  it('skips processing when the notification already sent', async () => {
    prisma.notification.findUnique.mockResolvedValue({
      id: 'ntf_123',
      status: NotificationStatus.sent,
    })

    await service.process('ntf_123')

    expect(prisma.notification.update).not.toHaveBeenCalled()
  })

  it('marks a notification as processing, sends through the provider, and records the audit event on success', async () => {
    const provider: {
      name: string
      send: jest.MockedFunction<
        () => Promise<{ success: boolean; providerMessageId: string }>
      >
    } = {
      name: 'console',
      send: jest
        .fn<() => Promise<{ success: boolean; providerMessageId: string }>>()
        .mockResolvedValue({
          success: true,
          providerMessageId: 'provider-1',
        }),
    }
    prisma.notification.findUnique.mockResolvedValue({
      id: 'ntf_123',
      userId: 'user-1',
      channel: NotificationChannel.email,
      platform: null,
      templateId: 'tpl-reminder',
      payload: { foo: 'bar' },
      status: NotificationStatus.queued,
      region: 'US',
    })
    providers.resolve.mockReturnValue(provider)
    prisma.userChannel.findFirst.mockResolvedValue({
      address: 'patient@example.com',
    })

    await service.process('ntf_123')

    expect(prisma.notification.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'ntf_123' },
      data: { status: NotificationStatus.processing },
    })
    expect(provider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: NotificationChannel.email,
        recipient: 'patient@example.com',
        templateId: 'tpl-reminder',
      }),
    )
    const updateArgs = prisma.notification.update.mock.calls[1][0] as {
      data: {
        status: NotificationStatus
        provider: string
        providerMessageId: string
        sentAt: Date
        attempts: { increment: number }
      }
    }
    expect(updateArgs.data).toMatchObject({
      status: NotificationStatus.sent,
      provider: 'console',
      providerMessageId: 'provider-1',
      attempts: { increment: 1 },
    })
    expect(updateArgs.data.sentAt).toEqual(expect.any(Date))

    const auditArgs = audit.record.mock.calls[0][0] as {
      actor: string
      action: string
      resourceId: string
      status: string
      region: string
    }
    expect(auditArgs).toMatchObject({
      actor: 'worker',
      action: 'notification.sent',
      resourceId: 'ntf_123',
      status: 'sent',
      region: 'US',
    })
  })

  it('stores the provider failure, increments attempts, and rethrows when delivery fails', async () => {
    const provider: {
      name: string
      send: jest.MockedFunction<
        () => Promise<{ success: boolean; error: string }>
      >
    } = {
      name: 'console',
      send: jest
        .fn<() => Promise<{ success: boolean; error: string }>>()
        .mockResolvedValue({
          success: false,
          error: 'Provider unavailable',
        }),
    }
    prisma.notification.findUnique.mockResolvedValue({
      id: 'ntf_456',
      userId: 'user-2',
      channel: NotificationChannel.sms,
      platform: null,
      templateId: 'tpl-otp',
      payload: { code: '123456' },
      status: NotificationStatus.queued,
      region: 'EU',
    })
    providers.resolve.mockReturnValue(provider)
    prisma.userChannel.findFirst.mockResolvedValue({ address: '+15551230000' })

    await expect(service.process('ntf_456')).rejects.toThrow(
      'Provider "console" failed to deliver: Provider unavailable',
    )
    expect(prisma.notification.update).toHaveBeenLastCalledWith({
      where: { id: 'ntf_456' },
      data: {
        attempts: { increment: 1 },
        lastError: 'Provider unavailable',
      },
    })
  })

  it('marks the notification failed and throws when no provider supports the channel', async () => {
    prisma.notification.findUnique.mockResolvedValue({
      id: 'ntf_789',
      userId: 'user-3',
      channel: NotificationChannel.push,
      platform: 'android',
      templateId: 'tpl-push',
      payload: {},
      status: NotificationStatus.queued,
      region: 'US',
    })
    providers.resolve.mockReturnValue(undefined)

    await expect(service.process('ntf_789')).rejects.toThrow(
      ProviderUnavailableException,
    )
    expect(prisma.notification.update).toHaveBeenLastCalledWith({
      where: { id: 'ntf_789' },
      data: {
        attempts: { increment: 1 },
        lastError: 'No provider configured for channel=push',
      },
    })
  })

  it('marks the notification failed and throws when the recipient cannot be resolved', async () => {
    const provider = { name: 'console', send: jest.fn() }
    prisma.notification.findUnique.mockResolvedValue({
      id: 'ntf_999',
      userId: 'user-4',
      channel: NotificationChannel.email,
      platform: null,
      templateId: 'tpl-reminder',
      payload: {},
      status: NotificationStatus.queued,
      region: 'US',
    })
    providers.resolve.mockReturnValue(provider)
    prisma.userChannel.findFirst.mockResolvedValue(null)

    await expect(service.process('ntf_999')).rejects.toThrow(
      RecipientNotFoundException,
    )
    expect(provider.send).not.toHaveBeenCalled()
    expect(prisma.notification.update).toHaveBeenLastCalledWith({
      where: { id: 'ntf_999' },
      data: {
        attempts: { increment: 1 },
        lastError: 'No contact channel found for user=user-4 channel=email',
      },
    })
  })
})
