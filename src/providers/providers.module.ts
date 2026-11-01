import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ConsoleNotificationProvider } from '@/providers/console-notification.provider.js'
import { ProviderRegistry } from '@/providers/provider-registry.service.js'
import { SendGridEmailProvider } from '@/providers/sendgrid-email.provider.js'

@Module({
  imports: [ConfigModule],
  providers: [
    ProviderRegistry,
    ConsoleNotificationProvider,
    SendGridEmailProvider,
  ],
  exports: [ProviderRegistry],
})
export class ProvidersModule {
  constructor(
    registry: ProviderRegistry,
    consoleProvider: ConsoleNotificationProvider,
    sendGridProvider: SendGridEmailProvider,
    config: ConfigService,
  ) {
    const provider = config.get<string>('EMAIL_PROVIDER')
    if (provider === 'sendgrid') {
      if (
        !config.get<string>('SENDGRID_API_KEY') ||
        !config.get<string>('SENDGRID_FROM_EMAIL')
      ) {
        throw new Error(
          'SENDGRID_API_KEY and SENDGRID_FROM_EMAIL are required when EMAIL_PROVIDER=sendgrid',
        )
      }
      registry.register(sendGridProvider)
    } else if (config.get<string>('NODE_ENV') === 'production') {
      throw new Error('EMAIL_PROVIDER=sendgrid is required in production')
    } else {
      registry.register(consoleProvider)
    }
  }
}
