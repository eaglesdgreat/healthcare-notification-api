import { ApiProperty } from '@nestjs/swagger'
import { NotificationStatus } from '@/generated/prisma/enums.js'

export class NotificationStatusResponseDto {
  @ApiProperty({ example: 'ntf_5f2c1e6a-2c3b-4b8e-9f1a-1234567890ab' })
  id!: string

  @ApiProperty({ enum: NotificationStatus, example: NotificationStatus.queued })
  status!: NotificationStatus

  @ApiProperty({ required: false, example: 0 })
  attempts?: number

  @ApiProperty({ required: false, nullable: true, example: null })
  providerMessageId?: string | null
}
