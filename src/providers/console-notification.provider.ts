import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  DeliveryStatus,
  NotificationProvider,
  ProviderPayload,
  ProviderResult,
} from './notification-provider.interface';

/**
 * Fallback provider used for local development — logs the message instead of
 * calling a real third party. Supports every channel.
 */
@Injectable()
export class ConsoleNotificationProvider implements NotificationProvider {
  readonly name = 'console';
  private readonly logger = new Logger(ConsoleNotificationProvider.name);

  supports(_channel: NotificationChannel, _platform?: string | null): boolean {
    return true;
  }

  async send(payload: ProviderPayload): Promise<ProviderResult> {
    const target = payload.platform
      ? `${payload.channel}/${payload.platform}`
      : payload.channel;
    this.logger.log(
      `[console] Sending ${target} notification to ${payload.recipient} (template: ${payload.templateId}) — ${payload.content.body}`,
    );
    return { success: true, providerMessageId: `console_${randomUUID()}` };
  }

  async getDeliveryStatus(providerMessageId: string): Promise<DeliveryStatus> {
    return { status: 'delivered', providerMessageId };
  }
}
