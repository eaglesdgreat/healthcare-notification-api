import { jest } from '@jest/globals'
import { getQueueToken } from '@nestjs/bullmq'
import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { NotificationStatus } from '@/generated/prisma/enums.js'
import type { SendNotificationDto } from '@/notification/dto/send-notification.dto.js'
import { NotificationService } from '@/notification/notification.service.js'
import { PrismaService } from '@/prisma/prisma.service.js'
import { QUEUE_NAMES } from '@/queue/queue.constants.js'

describe('NotificationService (integration)', () => {
  let service: NotificationService
  let prisma: {
    notification: {
      findUnique: jest.MockedFunction<(args: any) => Promise<any>>
      create: jest.MockedFunction<(args: any) => Promise<any>>
    }
  }
  let emailQueue: {
    add: jest.MockedFunction<
      (jobName: string, payload: any, options?: any) => Promise<any>
    >
  }

  beforeEach(async () => {
    prisma = {
      notification: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    }
    emailQueue = { add: jest.fn() }

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn<() => string>().mockReturnValue('US'),
          },
        },
        {
          provide: getQueueToken(QUEUE_NAMES.EMAIL),
          useValue: emailQueue,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.SMS),
          useValue: { add: jest.fn<() => Promise<any>>() },
        },
        {
          provide: getQueueToken(QUEUE_NAMES.PUSH_IOS),
          useValue: { add: jest.fn<() => Promise<any>>() },
        },
        {
          provide: getQueueToken(QUEUE_NAMES.PUSH_ANDROID),
          useValue: { add: jest.fn<() => Promise<any>>() },
        },
      ],
    }).compile()

    service = moduleRef.get(NotificationService)
  })

  it('creates notifications through Nest dependency injection', async () => {
    prisma.notification.findUnique.mockResolvedValue(null)
    prisma.notification.create.mockResolvedValue({
      id: 'ntf_di_1',
      status: NotificationStatus.queued,
    })
    emailQueue.add.mockResolvedValue({ id: 'job-1' })

    const dto: SendNotificationDto = {
      userId: 'user-1',
      channel: 'email',
      templateId: 'tpl-reminder',
      payload: { appointment: '2026-09-10' },
      legalBasis: 'treatment',
    }

    await expect(service.send(dto, 'idem-di')).resolves.toEqual({
      id: 'ntf_di_1',
      status: NotificationStatus.queued,
    })

    expect(emailQueue.add).toHaveBeenCalledWith(
      'send-notification',
      { notificationId: 'ntf_di_1' },
      expect.objectContaining({ jobId: 'ntf_di_1' }),
    )
  })
})
