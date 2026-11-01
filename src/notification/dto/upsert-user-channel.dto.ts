import { ApiProperty } from '@nestjs/swagger'
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator'
import { NotificationChannel } from '@/generated/prisma/enums.js'

export class UpsertUserChannelDto {
  @ApiProperty({ example: 'user_123' })
  @IsString()
  @MaxLength(64)
  userId!: string

  @ApiProperty({
    enum: NotificationChannel,
    example: NotificationChannel.email,
  })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel

  @ApiProperty({ example: 'patient@example.com' })
  @IsString()
  @MaxLength(320)
  @ValidateIf(
    (dto: UpsertUserChannelDto) => dto.channel === NotificationChannel.email,
  )
  @IsEmail()
  address!: string

  @ApiProperty({ required: false, enum: ['ios', 'android'] })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  platform?: string
}
