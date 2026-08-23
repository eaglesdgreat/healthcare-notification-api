import { NotificationChannel } from '@prisma/client';
import {
  DeliveryStatus,
  NotificationProvider,
  ProviderPayload,
  ProviderResult,
} from '../notification-provider.interface';

/**
 * Reference implementation of the Apple Push Notification service (iOS push)
 * provider.
 *
 * To activate:
 *  1. `npm install apn`
 *  2. Set `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY_PATH`, `APNS_TOPIC`
 *     and `PUSH_PROVIDER=apns`
 *  3. Register this provider in `ProvidersModule`.
 */
export class ApnsProvider implements NotificationProvider {
  readonly name = 'apns';

  supports(channel: NotificationChannel, platform?: string | null): boolean {
    return channel === NotificationChannel.push && platform === 'ios';
  }

  async send(_payload: ProviderPayload): Promise<ProviderResult> {
    throw new Error(
      'ApnsProvider is not configured — install apn and wire this provider in ProvidersModule.',
    );
  }

  async getDeliveryStatus(providerMessageId: string): Promise<DeliveryStatus> {
    return { status: 'unknown', providerMessageId };
  }
}
