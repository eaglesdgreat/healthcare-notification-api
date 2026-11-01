import { NotificationChannel } from '@/generated/prisma/enums.js'
import { ConsoleNotificationProvider } from '@/providers/console-notification.provider.js'
import { ProviderRegistry } from '@/providers/provider-registry.service.js'
import { ProvidersModule } from '@/providers/providers.module.js'
import { ConfigService } from '@nestjs/config'
import { SendGridEmailProvider } from '@/providers/sendgrid-email.provider.js'

describe('ProvidersModule', () => {
  it('registers the console provider outside production', () => {
    const registry = new ProviderRegistry()
    const config = {
      get: (name: string) => (name === 'NODE_ENV' ? 'development' : undefined),
    }

    new ProvidersModule(
      registry,
      new ConsoleNotificationProvider(),
      {} as SendGridEmailProvider,
      config as ConfigService,
    )

    expect(registry.resolve(NotificationChannel.email)).toBeDefined()
  })

  it('requires a real email provider in production', () => {
    const registry = new ProviderRegistry()
    const config = {
      get: (name: string) => (name === 'NODE_ENV' ? 'production' : undefined),
    }

    expect(
      () =>
        new ProvidersModule(
          registry,
          new ConsoleNotificationProvider(),
          {} as SendGridEmailProvider,
          config as ConfigService,
        ),
    ).toThrow('EMAIL_PROVIDER=sendgrid is required in production')
  })
})
