import { Injectable, Logger } from '@nestjs/common'
import {
  NotificationChannel,
  NotificationStatus,
} from '../generated/prisma/enums.js'
import { AuditService } from '../audit/audit.service.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { ProviderPayload } from '../providers/notification-provider.interface.js'
import { ProviderRegistry } from '../providers/provider-registry.service.js'

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
      throw new Error(`Notification ${notificationId} not found`)
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
      throw new Error(
        `No provider configured for channel=${notification.channel} platform=${notification.platform ?? 'none'}`,
      )
    }

    const recipient = await this.resolveRecipient(
      notification.userId,
      notification.channel,
    )
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

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        attempts: { increment: 1 },
        lastError: result.error ?? 'Unknown provider error',
      },
    })
    // Throwing triggers BullMQ retry with exponential backoff (see queue.module.ts).
    throw new Error(result.error ?? 'Provider send failed')
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
      throw new Error(
        `No contact channel found for user=${userId} channel=${channel}`,
      )
    }
    return userChannel.address ?? userChannel.deviceToken ?? ''
  }
}
