import { jest } from '@jest/globals'
import { Logger } from '@nestjs/common'
import { AuditService } from '@/audit/audit.service.js'
import { PrismaService } from '@/prisma/prisma.service.js'

describe('AuditService', () => {
  it('creates an audit log entry and logs the action', async () => {
    const prisma: {
      auditLog: {
        create: jest.MockedFunction<(args: any) => Promise<unknown>>
      }
    } = {
      auditLog: {
        create: jest
          .fn<(args: any) => Promise<unknown>>()
          .mockResolvedValue({}),
      },
    }
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined)
    const service = new AuditService(prisma as unknown as PrismaService)

    await service.record({
      actor: 'worker',
      action: 'notification.sent',
      resourceType: 'notification',
      resourceId: 'ntf_123',
      status: 'sent',
      region: 'US',
      metadata: { provider: 'console' },
    })

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actor: 'worker',
        action: 'notification.sent',
        resourceType: 'notification',
        resourceId: 'ntf_123',
        status: 'sent',
        region: 'US',
        metadata: { provider: 'console' },
      },
    })
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'audit.recorded',
        action: 'notification.sent',
        resourceId: 'ntf_123',
        status: 'sent',
        message: 'Audit activity persisted',
      }),
    )
    logSpy.mockRestore()
  })

  it('logs and rethrows audit persistence failures', async () => {
    const failure = new Error('database connection failed')
    const prisma = {
      auditLog: {
        create: jest
          .fn<(args: any) => Promise<unknown>>()
          .mockRejectedValue(failure),
      },
    }
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined)
    const service = new AuditService(prisma as unknown as PrismaService)

    await expect(
      service.record({
        actor: 'worker',
        action: 'notification.sent',
        resourceType: 'notification',
        resourceId: 'ntf_123',
        status: 'sent',
        region: 'US',
      }),
    ).rejects.toBe(failure)
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'audit.record.failed',
        errorType: 'Error',
        message: 'Failed to persist audit activity',
      }),
    )
    errorSpy.mockRestore()
  })
})
