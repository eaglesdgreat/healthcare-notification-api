import {
  IsDateString,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import type { Prisma } from '@/generated/prisma/client.js'
import { LegalBasis, NotificationChannel } from '@/generated/prisma/enums.js'

export class SendNotificationDto {
  @ApiProperty({ description: 'The recipient user id.', example: 'user_123' })
  @IsString()
  @MaxLength(64)
  userId!: string

  @ApiProperty({
    enum: NotificationChannel,
    description: 'Delivery channel for the notification.',
    example: NotificationChannel.email,
  })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel

  @ApiPropertyOptional({
    enum: ['ios', 'android'],
    description: 'Required when channel is "push".',
  })
  @IsOptional()
  @IsIn(['ios', 'android'])
  platform?: string

  @ApiProperty({
    description: 'Identifier of the message template to render.',
    example: 'appointment-reminder',
  })
  @IsString()
  @MaxLength(128)
  templateId!: string

  @ApiProperty({
    description: 'Template variables used to render the notification content.',
    example: { appointment: '2026-09-10T10:00:00Z' },
  })
  @IsObject()
  payload!: Prisma.InputJsonValue

  @ApiProperty({
    enum: LegalBasis,
    description: 'GDPR/HIPAA legal basis for sending this notification.',
    example: LegalBasis.treatment,
  })
  @IsEnum(LegalBasis)
  legalBasis!: LegalBasis

  @ApiPropertyOptional({
    description: 'ISO 8601 timestamp to delay delivery until.',
    example: '2026-09-10T10:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string
}
