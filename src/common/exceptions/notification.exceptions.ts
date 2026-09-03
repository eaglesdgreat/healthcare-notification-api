import { HttpStatus } from '@nestjs/common'
import { NotificationChannel } from '@/generated/prisma/enums.js'
import { DomainException } from '@/common/exceptions/domain.exception.js'

/** Thrown when a notification id does not exist (status lookup, worker processing). */
export class NotificationNotFoundException extends DomainException {
  readonly errorCode = 'NOTIFICATION_NOT_FOUND'

  constructor(notificationId: string) {
    super(`Notification ${notificationId} not found`, HttpStatus.NOT_FOUND)
  }
}

/** Thrown when no registered provider can deliver on the requested channel/platform. */
export class ProviderUnavailableException extends DomainException {
  readonly errorCode = 'PROVIDER_UNAVAILABLE'

  constructor(channel: NotificationChannel, platform?: string | null) {
    super(
      `No provider configured for channel=${channel} platform=${platform ?? 'none'}`,
      HttpStatus.SERVICE_UNAVAILABLE,
    )
  }
}

/** Thrown when a user has no reachable address/device token for the requested channel. */
export class RecipientNotFoundException extends DomainException {
  readonly errorCode = 'RECIPIENT_NOT_FOUND'

  constructor(userId: string, channel: NotificationChannel) {
    super(
      `No contact channel found for user=${userId} channel=${channel}`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    )
  }
}

/** Thrown when a notification DTO requests a channel/platform combination we cannot route. */
export class UnsupportedChannelException extends DomainException {
  readonly errorCode = 'UNSUPPORTED_CHANNEL'

  constructor(channel: string) {
    super(`Unsupported channel: ${channel}`, HttpStatus.BAD_REQUEST)
  }
}

/** Thrown when the upstream provider rejects or fails to deliver a message. */
export class ProviderDeliveryFailedException extends DomainException {
  readonly errorCode = 'PROVIDER_DELIVERY_FAILED'

  constructor(providerName: string, reason: string) {
    super(
      `Provider "${providerName}" failed to deliver: ${reason}`,
      HttpStatus.BAD_GATEWAY,
    )
  }
}

/** Thrown when request body/query/param validation fails (ValidationPipe). */
export class RequestValidationException extends DomainException {
  readonly errorCode = 'VALIDATION_FAILED'

  constructor(messages: string[]) {
    super(messages.join('; ') || 'Validation failed', HttpStatus.BAD_REQUEST)
  }
}

/** Thrown when the required Idempotency-Key header is missing from a send request. */
export class IdempotencyKeyRequiredException extends DomainException {
  readonly errorCode = 'IDEMPOTENCY_KEY_REQUIRED'

  constructor() {
    super('Idempotency-Key header is required', HttpStatus.BAD_REQUEST)
  }
}
