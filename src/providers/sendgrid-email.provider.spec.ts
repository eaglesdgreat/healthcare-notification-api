import { jest } from '@jest/globals'
import { ConfigService } from '@nestjs/config'
import { NotificationChannel } from '@/generated/prisma/enums.js'
import { SendGridEmailProvider } from '@/providers/sendgrid-email.provider.js'
import type { ProviderPayload } from '@/providers/notification-provider.interface.js'

describe('SendGridEmailProvider', () => {
  const configValues: Record<string, string> = {
    SENDGRID_API_KEY: 'test-secret',
    SENDGRID_FROM_EMAIL: 'no-reply@example.test',
  }
  const config = {
    get: (name: string) => configValues[name],
  } as ConfigService
  const originalFetch = global.fetch
  let provider: SendGridEmailProvider

  beforeEach(() => {
    provider = new SendGridEmailProvider(config)
  })

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it('sends only plain-text content and returns the provider message id', async () => {
    const fetchMock: jest.MockedFunction<typeof fetch> = jest.fn()
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 202,
        headers: { 'x-message-id': 'sg-message-1' },
      }),
    )
    global.fetch = fetchMock
    const payload: ProviderPayload = {
      channel: NotificationChannel.email,
      recipient: 'person@example.test',
      templateId: 'auth-account-activation',
      content: { subject: 'Activate', body: 'Activation text' },
    }

    await expect(provider.send(payload)).resolves.toEqual({
      success: true,
      providerMessageId: 'sg-message-1',
    })
    const [, options] = fetchMock.mock.calls[0]
    if (typeof options?.body !== 'string') {
      throw new Error('Expected SendGrid request body to be JSON')
    }
    const requestBody = JSON.parse(options.body) as {
      content: Array<{ type: string; value: string }>
    }
    expect(requestBody.content).toEqual([
      { type: 'text/plain', value: 'Activation text' },
    ])
    expect(options?.headers).toMatchObject({
      Authorization: 'Bearer test-secret',
    })
    expect(options?.signal).toBeInstanceOf(AbortSignal)
  })

  it('does not expose provider response details on delivery failures', async () => {
    const fetchMock: jest.MockedFunction<typeof fetch> = jest.fn()
    fetchMock.mockResolvedValue(
      new Response('secret provider detail', { status: 500 }),
    )
    global.fetch = fetchMock

    await expect(
      provider.send({
        channel: NotificationChannel.email,
        recipient: 'person@example.test',
        templateId: 'auth-account-activation',
        content: { body: 'text' },
      }),
    ).resolves.toEqual({
      success: false,
      error: 'Email provider rejected the message',
    })
  })
})
