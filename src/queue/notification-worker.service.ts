import { Injectable, Logger } from '@nestjs/common'
import {
  NotificationChannel,
  NotificationStatus,
} from '@/generated/prisma/enums.js'
import { AuditService } from '@/audit/audit.service.js'
import { PrismaService } from '@/prisma/prisma.service.js'
import { ProviderPayload } from '@/providers/notification-provider.interface.js'
import type { ProviderResult } from '@/providers/notification-provider.interface.js'
import { ProviderRegistry } from '@/providers/provider-registry.service.js'
import {
  NotificationNotFoundException,
  ProviderDeliveryFailedException,
  ProviderUnavailableException,
  RecipientNotFoundException,
} from '@/common/exceptions/notification.exceptions.js'
import { MetricsService } from '@/common/metrics/metrics.service.js'

@Injectable()
export class NotificationWorkerService {
  private readonly logger = new Logger(NotificationWorkerService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProviderRegistry,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
  ) {}

  async process(
    notificationId: string,
    isFinalAttempt = false,
    requestId?: string,
  ): Promise<void> {
    let activity: Record<string, unknown> = {
      notificationId,
      requestId,
      finalAttempt: isFinalAttempt,
    }
    let stage = 'load_notification'

    try {
      const notification = await this.prisma.notification.findUnique({
        where: { id: notificationId },
      })
      if (!notification) {
        throw new NotificationNotFoundException(notificationId)
      }
      activity = {
        ...activity,
        channel: notification.channel,
        region: notification.region,
        attempt: notification.attempts + 1,
      }
      if (notification.status === NotificationStatus.sent) {
        this.logger.warn({
          ...activity,
          event: 'notification.delivery.skipped',
          message: 'Notification was already sent',
        })
        return
      }

      this.logger.log({
        ...activity,
        event: 'notification.delivery.started',
        message: 'Notification delivery attempt started',
      })

      stage = 'mark_processing'
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { status: NotificationStatus.processing },
      })

      stage = 'resolve_provider'
      const provider = this.providers.resolve(
        notification.channel,
        notification.platform,
      )
      if (!provider) {
        await this.markFailed(
          notificationId,
          `No provider configured for channel=${notification.channel}`,
          isFinalAttempt,
        )
        this.metrics.incrementDelivered(
          notification.channel,
          'unavailable',
          'failed',
        )
        throw new ProviderUnavailableException(
          notification.channel,
          notification.platform,
        )
      }
      activity = { ...activity, provider: provider.name }

      let recipient: string
      try {
        stage = 'resolve_recipient'
        recipient = await this.resolveRecipient(
          notification.userId,
          notification.channel,
        )
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Recipient resolution failed'
        await this.markFailed(notificationId, message, isFinalAttempt)
        this.metrics.incrementDelivered(
          notification.channel,
          provider.name,
          'failed',
        )
        throw error
      }

      const payload: ProviderPayload = {
        channel: notification.channel,
        platform: notification.platform,
        recipient,
        templateId: notification.templateId,
        content: {
          subject: `Notification: ${notification.templateId}`,
          body: JSON.stringify(notification.payload ?? {}),
        },
      }

      let result: ProviderResult
      try {
        stage = 'send'
        result = await provider.send(payload)
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : 'Unknown provider error'
        await this.markFailed(notificationId, reason, isFinalAttempt)
        this.metrics.incrementDelivered(
          notification.channel,
          provider.name,
          'failed',
        )
        throw new ProviderDeliveryFailedException(provider.name, reason)
      }

      if (result.success) {
        activity = { ...activity, deliveryOutcome: 'sent' }
        stage = 'persist_sent'
        await this.prisma.notification.update({
          where: { id: notificationId },
          data: {
            status: NotificationStatus.sent,
            provider: provider.name,
            providerMessageId: result.providerMessageId,
            sentAt: new Date(),
            attempts: { increment: 1 },
          },
        })
        stage = 'persist_audit'
        await this.audit.record({
          actor: 'worker',
          action: 'notification.sent',
          resourceType: 'notification',
          resourceId: notificationId,
          status: 'sent',
          region: notification.region,
          metadata: {
            provider: provider.name,
            channel: notification.channel,
          },
        })
        this.metrics.incrementDelivered(
          notification.channel,
          provider.name,
          'sent',
        )
        this.logger.log({
          ...activity,
          event: 'notification.delivery.succeeded',
          message: 'Notification delivered successfully',
        })
        return
      }

      const reason = result.error ?? 'Unknown provider error'
      stage = 'persist_failure'
      await this.markFailed(notificationId, reason, isFinalAttempt)
      this.metrics.incrementDelivered(
        notification.channel,
        provider.name,
        'failed',
      )
      throw new ProviderDeliveryFailedException(provider.name, reason)
    } catch (error) {
      const deliverySucceeded = activity.deliveryOutcome === 'sent'
      this.logger.error({
        ...activity,
        event: deliverySucceeded
          ? 'notification.processing.failed'
          : 'notification.delivery.failed',
        stage,
        errorType: error instanceof Error ? error.name : 'UnknownError',
        outcome: deliverySucceeded
          ? 'sent'
          : isFinalAttempt
            ? 'failed'
            : 'retrying',
        message: deliverySucceeded
          ? 'Notification delivered but processing failed'
          : 'Notification delivery attempt failed',
      })
      throw error
    }
  }

  private async markFailed(
    notificationId: string,
    reason: string,
    isFinalAttempt: boolean,
  ): Promise<void> {
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        ...(isFinalAttempt ? { status: NotificationStatus.failed } : {}),
        attempts: { increment: 1 },
        lastError: reason,
      },
    })
  }

  private async resolveRecipient(
    userId: string,
    channel: NotificationChannel,
  ): Promise<string> {
    const userChannel = await this.prisma.userChannel.findFirst({
      where: { userId, channel },
      orderBy: { createdAt: 'desc' },
    })
    if (!userChannel) {
      throw new RecipientNotFoundException(userId, channel)
    }
    return userChannel.address ?? userChannel.deviceToken ?? ''
  }
}
