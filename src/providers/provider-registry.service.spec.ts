import { jest } from '@jest/globals'
import { NotificationChannel } from '@/generated/prisma/enums.js'
import type { NotificationProvider } from '@/providers/notification-provider.interface.js'
import { ProviderRegistry } from '@/providers/provider-registry.service.js'

describe('ProviderRegistry', () => {
  it('returns the provider that supports the requested channel and platform', () => {
    const registry = new ProviderRegistry()
    const emailProvider: NotificationProvider = {
      name: 'email-provider',
      supports: jest.fn<(channel: NotificationChannel) => boolean>(
        (channel: NotificationChannel) => channel === NotificationChannel.email,
      ),
      send: jest.fn<() => Promise<any>>(),
      getDeliveryStatus: jest.fn<() => Promise<any>>(),
    }
    const iosProvider: NotificationProvider = {
      name: 'ios-provider',
      supports: jest.fn<
        (channel: NotificationChannel, platform?: string | null) => boolean
      >((channel: NotificationChannel, platform?: string | null) => {
        return channel === NotificationChannel.push && platform === 'ios'
      }),
      send: jest.fn<() => Promise<any>>(),
      getDeliveryStatus: jest.fn<() => Promise<any>>(),
    }

    registry.register(emailProvider)
    registry.register(iosProvider)

    expect(registry.resolve(NotificationChannel.email)).toBe(emailProvider)
    expect(registry.resolve(NotificationChannel.push, 'ios')).toBe(iosProvider)
    expect(
      registry.resolve(NotificationChannel.push, 'android'),
    ).toBeUndefined()
  })
})
