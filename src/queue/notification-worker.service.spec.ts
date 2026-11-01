import { jest } from '@jest/globals'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createCipheriv, randomBytes } from 'node:crypto'
import {
  NotificationChannel,
  NotificationStatus,
} from '@/generated/prisma/enums.js'
import { AuditService } from '@/audit/audit.service.js'
import { PrismaService } from '@/prisma/prisma.service.js'
import { ProviderRegistry } from '@/providers/provider-registry.service.js'
import type {
  ProviderPayload,
  ProviderResult,
} from '@/providers/notification-provider.interface.js'
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
  let metrics: {
    incrementDelivered: jest.MockedFunction<
      (channel: string, provider: string, outcome: string) => void
    >
  }
  let logSpy: jest.SpiedFunction<typeof Logger.prototype.log>
  let warnSpy: jest.SpiedFunction<typeof Logger.prototype.warn>
  let errorSpy: jest.SpiedFunction<typeof Logger.prototype.error>
  let service: NotificationWorkerService
  const config = { get: jest.fn() }

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
    metrics = { incrementDelivered: jest.fn() }
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined)
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined)
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined)
    service = new NotificationWorkerService(
      prisma as unknown as PrismaService,
      providers as unknown as ProviderRegistry,
      audit as unknown as AuditService,
      metrics as unknown as ConstructorParameters<
        typeof NotificationWorkerService
      >[3],
      config as unknown as ConfigService,
    )
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('throws when the notification is missing', async () => {
    prisma.notification.findUnique.mockResolvedValue(null)

    await expect(service.process('missing-id')).rejects.toThrow(
      'Notification missing-id not found',
    )
    expect(prisma.notification.update).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'notification.delivery.failed',
        notificationId: 'missing-id',
        message: 'Notification delivery attempt failed',
      }),
    )
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(
      'Provider unavailable',
    )
  })

  it('distinguishes audit persistence failures after successful provider delivery', async () => {
    const provider = {
      name: 'console',
      send: jest.fn<() => Promise<ProviderResult>>().mockResolvedValue({
        success: true,
        providerMessageId: 'provider-1',
      }),
    }
    prisma.notification.findUnique.mockResolvedValue({
      id: 'ntf_audit_failure',
      userId: 'user-1',
      channel: NotificationChannel.email,
      platform: null,
      templateId: 'tpl-reminder',
      payload: {},
      status: NotificationStatus.queued,
      attempts: 0,
      region: 'US',
    })
    providers.resolve.mockReturnValue(provider)
    prisma.userChannel.findFirst.mockResolvedValue({
      address: 'patient@example.com',
    })
    const auditFailure = new Error('audit store unavailable')
    audit.record.mockRejectedValue(auditFailure)

    await expect(
      service.process('ntf_audit_failure', true, 'req-audit'),
    ).rejects.toBe(auditFailure)

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'notification.processing.failed',
        notificationId: 'ntf_audit_failure',
        requestId: 'req-audit',
        deliveryOutcome: 'sent',
        stage: 'persist_audit',
        message: 'Notification delivered but processing failed',
      }),
    )
  })

  it('skips processing when the notification already sent', async () => {
    prisma.notification.findUnique.mockResolvedValue({
      id: 'ntf_123',
      status: NotificationStatus.sent,
    })

    await service.process('ntf_123', false, 'req-123')

    expect(prisma.notification.update).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'notification.delivery.skipped',
        notificationId: 'ntf_123',
        message: 'Notification was already sent',
      }),
    )
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

    await service.process('ntf_123', false, 'req-123')

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
    expect(metrics.incrementDelivered).toHaveBeenCalledWith(
      NotificationChannel.email,
      'console',
      'sent',
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'notification.delivery.succeeded',
        notificationId: 'ntf_123',
        requestId: 'req-123',
        channel: NotificationChannel.email,
        provider: 'console',
        message: 'Notification delivered successfully',
      }),
    )
  })

  it('decrypts activation payloads only to produce a plain-text email', async () => {
    const key = Buffer.alloc(32, 9)
    config.get.mockReturnValue(key.toString('base64'))
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const ciphertext = Buffer.concat([
      cipher.update(
        JSON.stringify({
          userId: 'user-activation',
          activationToken: 'c'.repeat(64),
          expiresAt: '2026-07-01T10:00:00.000Z',
        }),
        'utf8',
      ),
      cipher.final(),
    ])
    const provider = {
      name: 'sendgrid',
      send: jest
        .fn<(payload: ProviderPayload) => Promise<ProviderResult>>()
        .mockResolvedValue({
          success: true,
          providerMessageId: 'message-1',
        }),
    }
    prisma.notification.findUnique.mockResolvedValue({
      id: 'ntf_activation',
      userId: 'user-activation',
      channel: NotificationChannel.email,
      platform: null,
      templateId: 'auth-account-activation',
      payload: {
        encrypted: true,
        algorithm: 'aes-256-gcm',
        iv: iv.toString('base64'),
        authTag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64'),
      },
      status: NotificationStatus.queued,
      attempts: 0,
      region: 'US',
    })
    providers.resolve.mockReturnValue(provider)
    prisma.userChannel.findFirst.mockResolvedValue({
      address: 'patient@example.com',
    })

    await service.process('ntf_activation')

    const sentContent = provider.send.mock.calls[0]?.[0].content
    expect(sentContent.subject).toBe('Activate your healthcare account')
    expect(sentContent.body).toContain('c'.repeat(64))
    expect(sentContent.body).not.toContain('<html')
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain('c'.repeat(64))
  })

  it('refuses activation payloads that are not encrypted', async () => {
    prisma.notification.findUnique.mockResolvedValue({
      id: 'ntf_plaintext',
      userId: 'user-activation',
      channel: NotificationChannel.email,
      platform: null,
      templateId: 'auth-account-activation',
      payload: { activationToken: 'c'.repeat(64) },
      status: NotificationStatus.queued,
      attempts: 0,
      region: 'US',
    })
    const provider = { name: 'sendgrid', send: jest.fn() }
    providers.resolve.mockReturnValue(provider)
    prisma.userChannel.findFirst.mockResolvedValue({
      address: 'patient@example.com',
    })

    await expect(service.process('ntf_plaintext')).rejects.toThrow(
      'Activation notification payload is not encrypted',
    )
    expect(provider.send).not.toHaveBeenCalled()
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('c'.repeat(64))
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
    expect(metrics.incrementDelivered).toHaveBeenCalledWith(
      NotificationChannel.sms,
      'console',
      'failed',
    )
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'notification.delivery.failed',
        notificationId: 'ntf_456',
        outcome: 'retrying',
        message: 'Notification delivery attempt failed',
      }),
    )
  })

  it('marks a notification failed after the final provider attempt', async () => {
    const provider = {
      name: 'console',
      send: jest.fn<() => Promise<ProviderResult>>().mockResolvedValue({
        success: false,
        error: 'Provider unavailable',
      }),
    }
    prisma.notification.findUnique.mockResolvedValue({
      id: 'ntf_final',
      userId: 'user-final',
      channel: NotificationChannel.email,
      platform: null,
      templateId: 'tpl-reminder',
      payload: {},
      status: NotificationStatus.queued,
      region: 'US',
    })
    providers.resolve.mockReturnValue(provider)
    prisma.userChannel.findFirst.mockResolvedValue({
      address: 'patient@example.com',
    })

    await expect(service.process('ntf_final', true)).rejects.toThrow(
      'Provider "console" failed to deliver: Provider unavailable',
    )
    expect(prisma.notification.update).toHaveBeenLastCalledWith({
      where: { id: 'ntf_final' },
      data: {
        status: NotificationStatus.failed,
        attempts: { increment: 1 },
        lastError: 'Provider unavailable',
      },
    })
  })

  it('records thrown provider errors and rethrows them as delivery failures', async () => {
    const provider = {
      name: 'console',
      send: jest
        .fn<() => Promise<ProviderResult>>()
        .mockRejectedValue(new Error('Provider unavailable')),
    }
    prisma.notification.findUnique.mockResolvedValue({
      id: 'ntf_thrown',
      userId: 'user-thrown',
      channel: NotificationChannel.email,
      platform: null,
      templateId: 'tpl-reminder',
      payload: {},
      status: NotificationStatus.queued,
      region: 'US',
    })
    providers.resolve.mockReturnValue(provider)
    prisma.userChannel.findFirst.mockResolvedValue({
      address: 'patient@example.com',
    })

    await expect(service.process('ntf_thrown')).rejects.toThrow(
      'Provider "console" failed to deliver: Provider unavailable',
    )
    expect(prisma.notification.update).toHaveBeenLastCalledWith({
      where: { id: 'ntf_thrown' },
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
