import { NotificationChannel } from '@/generated/prisma/enums.js'
import { ConsoleNotificationProvider } from '@/providers/console-notification.provider.js'
import { ProviderRegistry } from '@/providers/provider-registry.service.js'
import { ProvidersModule } from '@/providers/providers.module.js'

describe('ProvidersModule', () => {
  const originalNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = originalNodeEnv
    }
  })

  it('registers the console provider outside production', () => {
    process.env.NODE_ENV = 'development'
    const registry = new ProviderRegistry()

    new ProvidersModule(registry, new ConsoleNotificationProvider())

    expect(registry.resolve(NotificationChannel.email)).toBeDefined()
  })

  it('does not register the console provider in production', () => {
    process.env.NODE_ENV = 'production'
    const registry = new ProviderRegistry()

    new ProvidersModule(registry, new ConsoleNotificationProvider())

    expect(registry.resolve(NotificationChannel.email)).toBeUndefined()
  })
})
