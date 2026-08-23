import { NotificationChannel } from '@prisma/client';
import {
  DeliveryStatus,
  NotificationProvider,
  ProviderPayload,
  ProviderResult,
} from '../notification-provider.interface';

/**
 * Reference implementation of the Twilio (SMS) provider.
 *
 * To activate:
 *  1. `npm install twilio`
 *  2. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
 *     and `SMS_PROVIDER=twilio`
 *  3. Register this provider in `ProvidersModule`.
 */
export class TwilioProvider implements NotificationProvider {
  readonly name = 'twilio';

  supports(channel: NotificationChannel, _platform?: string | null): boolean {
    return channel === NotificationChannel.sms;
  }

  async send(_payload: ProviderPayload): Promise<ProviderResult> {
    throw new Error(
      'TwilioProvider is not configured — install twilio and wire this provider in ProvidersModule.',
    );
  }

  async getDeliveryStatus(providerMessageId: string): Promise<DeliveryStatus> {
    return { status: 'unknown', providerMessageId };
  }
}
