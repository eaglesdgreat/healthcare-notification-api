import { NotificationChannel } from '@prisma/client';

export interface ProviderPayload {
  channel: NotificationChannel;
  platform?: string | null;
  recipient: string;
  templateId: string;
  content: {
    subject?: string;
    body: string;
  };
}

export interface ProviderResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface DeliveryStatus {
  status: string;
  providerMessageId: string;
}

/**
 * Contract every third-party adapter must implement so providers can be
 * plugged in / unplugged without touching the rest of the service.
 */
export interface NotificationProvider {
  readonly name: string;
  supports(channel: NotificationChannel, platform?: string | null): boolean;
  send(payload: ProviderPayload): Promise<ProviderResult>;
  getDeliveryStatus(providerMessageId: string): Promise<DeliveryStatus>;
}
