import { jest } from '@jest/globals'
import { ExecutionContext } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NotificationApiKeyGuard } from './notification-api-key.guard.js'

describe('NotificationApiKeyGuard', () => {
  const config = { get: jest.fn() }
  let guard: NotificationApiKeyGuard

  const makeContext = (apiKey?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          header: (name: string) => (name === 'x-api-key' ? apiKey : undefined),
        }),
      }),
    }) as unknown as ExecutionContext

  beforeEach(() => {
    jest.clearAllMocks()
    guard = new NotificationApiKeyGuard(config as unknown as ConfigService)
  })

  it('accepts a matching service key', () => {
    config.get.mockReturnValue('a'.repeat(40))
    expect(guard.canActivate(makeContext('a'.repeat(40)))).toBe(true)
  })

  it('rejects missing and incorrect service keys', () => {
    config.get.mockReturnValue('a'.repeat(40))
    expect(() => guard.canActivate(makeContext())).toThrow(
      'Invalid service credentials',
    )
    expect(() => guard.canActivate(makeContext('wrong'))).toThrow(
      'Invalid service credentials',
    )
  })

  it('fails closed when no service key is configured', () => {
    config.get.mockReturnValue(undefined)
    expect(() => guard.canActivate(makeContext('anything'))).toThrow(
      'Invalid service credentials',
    )
  })

  it('rejects configured keys shorter than 32 bytes', () => {
    config.get.mockReturnValue('short-key')
    expect(() => guard.canActivate(makeContext('short-key'))).toThrow(
      'Invalid service credentials',
    )
  })
})
