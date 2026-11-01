import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NotificationChannel } from '@/generated/prisma/enums.js'
import {
  DeliveryStatus,
  NotificationProvider,
  ProviderPayload,
  ProviderResult,
} from '@/providers/notification-provider.interface.js'

@Injectable()
export class SendGridEmailProvider implements NotificationProvider {
  readonly name = 'sendgrid'

  constructor(private readonly config: ConfigService) {}

  supports(channel: NotificationChannel): boolean {
    return channel === NotificationChannel.email
  }

  async send(payload: ProviderPayload): Promise<ProviderResult> {
    const apiKey = this.config.get<string>('SENDGRID_API_KEY')
    const from = this.config.get<string>('SENDGRID_FROM_EMAIL')
    if (!apiKey || !from) {
      return { success: false, error: 'Email provider is not configured' }
    }

    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: payload.recipient }] }],
          from: { email: from },
          subject: payload.content.subject ?? 'Healthcare account notification',
          content: [{ type: 'text/plain', value: payload.content.body }],
        }),
        signal: AbortSignal.timeout(10000),
      })
      if (response.status !== 202) {
        return { success: false, error: 'Email provider rejected the message' }
      }

      const providerMessageId = response.headers.get('x-message-id')
      return {
        success: true,
        ...(providerMessageId ? { providerMessageId } : {}),
      }
    } catch {
      return { success: false, error: 'Email provider request failed' }
    }
  }

  getDeliveryStatus(providerMessageId: string): Promise<DeliveryStatus> {
    return Promise.resolve({ status: 'accepted', providerMessageId })
  }
}
