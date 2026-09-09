import { Injectable, Logger } from '@nestjs/common'
import {
  NotificationChannel,
  NotificationStatus,
} from '@/generated/prisma/enums.js'
import { AuditService } from '@/audit/audit.service.js'
import { PrismaService } from '@/prisma/prisma.service.js'
import { ProviderPayload } from '@/providers/notification-provider.interface.js'
import { ProviderRegistry } from '@/providers/provider-registry.service.js'
import {
  NotificationNotFoundException,
  ProviderDeliveryFailedException,
  ProviderUnavailableException,
  RecipientNotFoundException,
} from '@/common/exceptions/notification.exceptions.js'

@Injectable()
export class NotificationWorkerService {
  private readonly logger = new Logger(NotificationWorkerService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProviderRegistry,
    private readonly audit: AuditService,
  ) {}

  async process(notificationId: string): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    })
    if (!notification) {
      throw new NotificationNotFoundException(notificationId)
    }
    if (notification.status === NotificationStatus.sent) {
      this.logger.warn(`Notification ${notificationId} already sent — skipping`)
      return
    }

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: NotificationStatus.processing },
    })

    const provider = this.providers.resolve(
      notification.channel,
      notification.platform,
    )
    if (!provider) {
      await this.markFailed(
        notificationId,
        `No provider configured for channel=${notification.channel}`,
      )
      throw new ProviderUnavailableException(
        notification.channel,
        notification.platform,
      )
    }

    let recipient: string
    try {
      recipient = await this.resolveRecipient(
        notification.userId,
        notification.channel,
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Recipient resolution failed'
      await this.markFailed(notificationId, message)
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

    const result = await provider.send(payload)

    if (result.success) {
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
      return
    }

    const reason = result.error ?? 'Unknown provider error'
    await this.markFailed(notificationId, reason)
    // Throwing triggers BullMQ retry with exponential backoff (see queue.module.ts).
    throw new ProviderDeliveryFailedException(provider.name, reason)
  }

  private async markFailed(
    notificationId: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
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
