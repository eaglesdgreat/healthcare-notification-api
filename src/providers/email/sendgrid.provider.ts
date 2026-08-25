import { NotificationChannel } from '@/generated/prisma/enums.js'
import {
  DeliveryStatus,
  NotificationProvider,
  ProviderPayload,
  ProviderResult,
} from '@/providers/notification-provider.interface.js'

/**
 * Reference implementation of the SendGrid (email) provider.
 *
 * To activate:
 *  1. `npm install @sendgrid/mail`
 *  2. Set `SENDGRID_API_KEY` and `EMAIL_PROVIDER=sendgrid`
 *  3. Register this provider in `ProvidersModule`.
 */
export class SendGridProvider implements NotificationProvider {
  readonly name = 'sendgrid'

  supports(channel: NotificationChannel, _platform?: string | null): boolean {
    return channel === NotificationChannel.email
  }

  send(_payload: ProviderPayload): Promise<ProviderResult> {
    throw new Error(
      'SendGridProvider is not configured — install @sendgrid/mail and wire this provider in ProvidersModule.',
    )
  }

  getDeliveryStatus(providerMessageId: string): Promise<DeliveryStatus> {
    return Promise.resolve({ status: 'unknown', providerMessageId })
  }
}
