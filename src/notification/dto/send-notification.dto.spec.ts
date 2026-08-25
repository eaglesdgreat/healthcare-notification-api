import { LegalBasis, NotificationChannel } from '@/generated/prisma/enums.js'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { SendNotificationDto } from '@/notification/dto/send-notification.dto.js'

describe('SendNotificationDto', () => {
  it('accepts a valid payload', async () => {
    const dto = plainToInstance(SendNotificationDto, {
      userId: 'user-1',
      channel: NotificationChannel.email,
      templateId: 'tpl-appt-reminder',
      payload: { appt_time: '2026-08-22T10:00:00Z' },
      legalBasis: LegalBasis.treatment,
    })

    const errors = await validate(dto)
    expect(errors).toHaveLength(0)
  })

  it('rejects an unknown channel', async () => {
    const dto = plainToInstance(SendNotificationDto, {
      userId: 'user-1',
      channel: 'carrier-pigeon',
      templateId: 'tpl-1',
      payload: {},
      legalBasis: LegalBasis.treatment,
    })

    const errors = await validate(dto)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects a missing legal basis', async () => {
    const dto = plainToInstance(SendNotificationDto, {
      userId: 'user-1',
      channel: 'sms',
      templateId: 'tpl-1',
      payload: {},
    })

    const errors = await validate(dto)
    expect(errors.length).toBeGreaterThan(0)
  })
})
