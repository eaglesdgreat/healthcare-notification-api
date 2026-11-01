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
import { UnsupportedChannelException } from '@/common/exceptions/notification.exceptions.js'
import { MetricsService } from '@/common/metrics/metrics.service.js'

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
    private readonly metrics: MetricsService,
  ) {}

  async send(
    dto: SendNotificationDto,
    idempotencyKey: string,
    requestId?: string,
  ): Promise<SendResult> {
    // TODO: resolve the user's region from the user directory (multi-region
    // gateway). For now each deployed instance is pinned to its own region.
    const region = this.config.get<string>('region') ?? 'US'

    try {
      const existing = await this.prisma.notification.findUnique({
        where: { dedupKey: idempotencyKey },
      })
      if (existing) {
        this.logDuplicate(existing.id, existing.status, dto.channel, requestId)
        return { id: existing.id, status: existing.status }
      }

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
        { notificationId: notification.id, requestId },
        {
          jobId: notification.id,
          delay: dto.scheduledAt
            ? this.delayUntil(new Date(dto.scheduledAt))
            : undefined,
        },
      )

      this.metrics.incrementEnqueued(dto.channel)
      this.logger.log({
        event: 'notification.enqueue.succeeded',
        notificationId: notification.id,
        channel: dto.channel,
        region,
        requestId,
        message: 'Notification accepted and queued',
      })

      return { id: notification.id, status: notification.status }
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        let duplicate
        try {
          duplicate = await this.prisma.notification.findUnique({
            where: { dedupKey: idempotencyKey },
          })
        } catch (lookupError) {
          this.logEnqueueFailure(lookupError, dto.channel, requestId)
          throw lookupError
        }
        if (duplicate) {
          this.logDuplicate(
            duplicate.id,
            duplicate.status,
            dto.channel,
            requestId,
          )
          return { id: duplicate.id, status: duplicate.status }
        }
      }
      this.logEnqueueFailure(error, dto.channel, requestId)
      throw error
    }
  }

  private logDuplicate(
    notificationId: string,
    status: NotificationStatus,
    channel: string,
    requestId?: string,
  ): void {
    this.logger.log({
      event: 'notification.enqueue.duplicate',
      notificationId,
      channel,
      status,
      requestId,
      message: 'Duplicate notification request returned existing notification',
    })
  }

  private logEnqueueFailure(
    error: unknown,
    channel: string,
    requestId?: string,
  ): void {
    this.logger.error({
      event: 'notification.enqueue.failed',
      channel,
      requestId,
      errorType: error instanceof Error ? error.name : 'UnknownError',
      message: 'Failed to enqueue notification',
    })
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
        throw new UnsupportedChannelException(String(dto.channel))
    }
  }

  private delayUntil(date: Date): number {
    return Math.max(0, date.getTime() - Date.now())
  }
}
