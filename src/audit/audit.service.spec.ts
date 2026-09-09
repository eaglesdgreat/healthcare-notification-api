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
      '[audit] worker notification.sent notification:ntf_123 -> sent',
    )

    logSpy.mockRestore()
  })
})
