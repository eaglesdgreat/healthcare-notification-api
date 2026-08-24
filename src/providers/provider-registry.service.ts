import { Injectable } from '@nestjs/common'
import { NotificationChannel } from '../generated/prisma/enums.js'
import { NotificationProvider } from './notification-provider.interface.js'

@Injectable()
export class ProviderRegistry {
  private readonly providers: NotificationProvider[] = []

  register(provider: NotificationProvider): void {
    this.providers.push(provider)
  }

  resolve(
    channel: NotificationChannel,
    platform?: string | null,
  ): NotificationProvider | undefined {
    return this.providers.find((provider) =>
      provider.supports(channel, platform),
    )
  }
}
