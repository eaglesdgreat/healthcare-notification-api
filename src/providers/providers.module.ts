import { Module } from '@nestjs/common';
import { ConsoleNotificationProvider } from './console-notification.provider';
import { ProviderRegistry } from './provider-registry.service';

@Module({
  providers: [ProviderRegistry, ConsoleNotificationProvider],
  exports: [ProviderRegistry],
})
export class ProvidersModule {
  constructor(
    registry: ProviderRegistry,
    consoleProvider: ConsoleNotificationProvider,
  ) {
    // Register the console provider as the development default.
    registry.register(consoleProvider);

    // Wire real providers once their SDKs are configured, e.g.:
    // registry.register(new SendGridProvider());
    // registry.register(new TwilioProvider());
    // registry.register(new FcmProvider());
    // registry.register(new ApnsProvider());
  }
}
