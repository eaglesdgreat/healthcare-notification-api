import { jest } from '@jest/globals'
import { Logger } from '@nestjs/common'
import { NotificationChannel } from '@/generated/prisma/enums.js'
import { ConsoleNotificationProvider } from '@/providers/console-notification.provider.js'

describe('ConsoleNotificationProvider', () => {
  it('does not log recipient addresses or message content', async () => {
    const logger = jest.spyOn(Logger.prototype, 'log')
    const provider = new ConsoleNotificationProvider()

    try {
      await provider.send({
        channel: NotificationChannel.email,
        recipient: 'patient@example.com',
        templateId: 'appointment-reminder',
        content: {
          subject: 'Appointment',
          body: 'Sensitive patient information',
        },
      })

      expect(logger).toHaveBeenCalledWith(
        '[console] Sending email notification (template: appointment-reminder)',
      )
      expect(logger).not.toHaveBeenCalledWith(
        expect.stringContaining('patient@example.com'),
      )
      expect(logger).not.toHaveBeenCalledWith(
        expect.stringContaining('Sensitive patient information'),
      )
    } finally {
      logger.mockRestore()
    }
  })
})
