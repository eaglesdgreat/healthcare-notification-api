import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { NotificationProvider } from './notification-provider.interface';

@Injectable()
export class ProviderRegistry {
  private readonly providers: NotificationProvider[] = [];

  register(provider: NotificationProvider): void {
    this.providers.push(provider);
  }

  resolve(
    channel: NotificationChannel,
    platform?: string | null,
  ): NotificationProvider | undefined {
    return this.providers.find((provider) => provider.supports(channel, platform));
  }
}
