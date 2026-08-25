import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@/generated/prisma/client.js'
import {
  NotificationChannel,
  NotificationStatus,
} from '@/generated/prisma/enums.js'
import { Queue } from 'bullmq'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '@/prisma/prisma.service.js'
import { NotificationJobData } from '@/queue/notification-job.interface.js'
import { QUEUE_NAMES } from '@/queue/queue.constants.js'
import { SendNotificationDto } from '@/notification/dto/send-notification.dto.js'

export interface SendResult {
  id: string
  status: NotificationStatus
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUE_NAMES.EMAIL)
    private readonly emailQueue: Queue<NotificationJobData>,
    @InjectQueue(QUEUE_NAMES.SMS)
    private readonly smsQueue: Queue<NotificationJobData>,
    @InjectQueue(QUEUE_NAMES.PUSH_IOS)
    private readonly pushIosQueue: Queue<NotificationJobData>,
    @InjectQueue(QUEUE_NAMES.PUSH_ANDROID)
    private readonly pushAndroidQueue: Queue<NotificationJobData>,
  ) {}

  async send(
    dto: SendNotificationDto,
    idempotencyKey: string,
  ): Promise<SendResult> {
    const existing = await this.prisma.notification.findUnique({
      where: { dedupKey: idempotencyKey },
    })
    if (existing) {
      return { id: existing.id, status: existing.status }
    }

    // TODO: resolve the user's region from the user directory (multi-region
    // gateway). For now each deployed instance is pinned to its own region.
    const region = this.config.get<string>('region') ?? 'US'

    try {
      const notification = await this.prisma.notification.create({
        data: {
          id: `ntf_${randomUUID()}`,
          userId: dto.userId,
          channel: dto.channel,
          platform: dto.platform ?? null,
          templateId: dto.templateId,
          payload: dto.payload,
          legalBasis: dto.legalBasis,
          region,
          status: NotificationStatus.queued,
          attempts: 0,
          dedupKey: idempotencyKey,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        },
      })

      await this.queueFor(dto).add(
        'send-notification',
        { notificationId: notification.id },
        {
          jobId: notification.id,
          delay: dto.scheduledAt
            ? this.delayUntil(new Date(dto.scheduledAt))
            : undefined,
        },
      )

      return { id: notification.id, status: notification.status }
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const duplicate = await this.prisma.notification.findUnique({
          where: { dedupKey: idempotencyKey },
        })
        if (duplicate) {
          return { id: duplicate.id, status: duplicate.status }
        }
      }
      const detail =
        error instanceof Error ? (error.stack ?? error.message) : String(error)
      this.logger.error(`Failed to enqueue notification: ${detail}`)
      throw error
    }
  }

  private queueFor(dto: SendNotificationDto): Queue<NotificationJobData> {
    switch (dto.channel) {
      case NotificationChannel.email:
        return this.emailQueue
      case NotificationChannel.sms:
        return this.smsQueue
      case NotificationChannel.push:
        return dto.platform === 'android'
          ? this.pushAndroidQueue
          : this.pushIosQueue
      default:
        throw new Error(`Unsupported channel: ${String(dto.channel)}`)
    }
  }

  private delayUntil(date: Date): number {
    return Math.max(0, date.getTime() - Date.now())
  }
}
