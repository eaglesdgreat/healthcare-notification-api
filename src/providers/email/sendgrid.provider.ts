import { NotificationChannel } from '@prisma/client';
import {
  DeliveryStatus,
  NotificationProvider,
  ProviderPayload,
  ProviderResult,
} from '../notification-provider.interface';

/**
 * Reference implementation of the SendGrid (email) provider.
 *
 * To activate:
 *  1. `npm install @sendgrid/mail`
 *  2. Set `SENDGRID_API_KEY` and `EMAIL_PROVIDER=sendgrid`
 *  3. Register this provider in `ProvidersModule`.
 */
export class SendGridProvider implements NotificationProvider {
  readonly name = 'sendgrid';

  supports(channel: NotificationChannel, _platform?: string | null): boolean {
    return channel === NotificationChannel.email;
  }

  async send(_payload: ProviderPayload): Promise<ProviderResult> {
    throw new Error(
      'SendGridProvider is not configured — install @sendgrid/mail and wire this provider in ProvidersModule.',
    );
  }

  async getDeliveryStatus(providerMessageId: string): Promise<DeliveryStatus> {
    return { status: 'unknown', providerMessageId };
  }
}
