import { HttpStatus } from '@nestjs/common'
import { NotificationChannel } from '@/generated/prisma/enums.js'
import {
  IdempotencyKeyRequiredException,
  NotificationNotFoundException,
  ProviderDeliveryFailedException,
  ProviderUnavailableException,
  RecipientNotFoundException,
  RequestValidationException,
  UnsupportedChannelException,
} from '@/common/exceptions/notification.exceptions.js'

describe('notification exceptions', () => {
  it('NotificationNotFoundException carries a 404 and stable error code', () => {
    const error = new NotificationNotFoundException('ntf_123')
    expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND)
    expect(error.errorCode).toBe('NOTIFICATION_NOT_FOUND')
    expect(error.message).toBe('Notification ntf_123 not found')
  })

  it('ProviderUnavailableException describes the missing channel/platform', () => {
    const error = new ProviderUnavailableException(
      NotificationChannel.push,
      'android',
    )
    expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE)
    expect(error.errorCode).toBe('PROVIDER_UNAVAILABLE')
    expect(error.message).toContain('channel=push')
    expect(error.message).toContain('platform=android')
  })

  it('RecipientNotFoundException reports a 422', () => {
    const error = new RecipientNotFoundException(
      'user-1',
      NotificationChannel.sms,
    )
    expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY)
    expect(error.errorCode).toBe('RECIPIENT_NOT_FOUND')
  })

  it('UnsupportedChannelException reports a 400', () => {
    const error = new UnsupportedChannelException('fax')
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST)
    expect(error.errorCode).toBe('UNSUPPORTED_CHANNEL')
    expect(error.message).toBe('Unsupported channel: fax')
  })

  it('ProviderDeliveryFailedException reports a 502 with the provider name and reason', () => {
    const error = new ProviderDeliveryFailedException('console', 'timeout')
    expect(error.getStatus()).toBe(HttpStatus.BAD_GATEWAY)
    expect(error.errorCode).toBe('PROVIDER_DELIVERY_FAILED')
    expect(error.message).toBe('Provider "console" failed to deliver: timeout')
  })

  it('IdempotencyKeyRequiredException reports a 400', () => {
    const error = new IdempotencyKeyRequiredException()
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST)
    expect(error.errorCode).toBe('IDEMPOTENCY_KEY_REQUIRED')
  })

  it('RequestValidationException joins multiple messages', () => {
    const error = new RequestValidationException([
      'a must be a string',
      'b is required',
    ])
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST)
    expect(error.errorCode).toBe('VALIDATION_FAILED')
    expect(error.message).toBe('a must be a string; b is required')
  })

  it('RequestValidationException falls back to a generic message when empty', () => {
    const error = new RequestValidationException([])
    expect(error.message).toBe('Validation failed')
  })
})
