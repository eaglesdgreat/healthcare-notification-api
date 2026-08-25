import { NotificationChannel } from '@/generated/prisma/enums.js'
import {
  DeliveryStatus,
  NotificationProvider,
  ProviderPayload,
  ProviderResult,
} from '@/providers/notification-provider.interface.js'

/**
 * Reference implementation of the Firebase Cloud Messaging (Android push)
 * provider.
 *
 * To activate:
 *  1. `npm install firebase-admin`
 *  2. Set `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`
 *     and `PUSH_PROVIDER=fcm`
 *  3. Register this provider in `ProvidersModule`.
 */
export class FcmProvider implements NotificationProvider {
  readonly name = 'fcm'

  supports(channel: NotificationChannel, platform?: string | null): boolean {
    return channel === NotificationChannel.push && platform === 'android'
  }

  send(_payload: ProviderPayload): Promise<ProviderResult> {
    throw new Error(
      'FcmProvider is not configured — install firebase-admin and wire this provider in ProvidersModule.',
    )
  }

  getDeliveryStatus(providerMessageId: string): Promise<DeliveryStatus> {
    return Promise.resolve({ status: 'unknown', providerMessageId })
  }
}
