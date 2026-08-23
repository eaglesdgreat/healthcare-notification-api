import {
  IsDateString,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { LegalBasis, NotificationChannel, Prisma } from '@prisma/client';

export class SendNotificationDto {
  @IsString()
  @MaxLength(64)
  userId!: string;

  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsOptional()
  @IsIn(['ios', 'android'])
  platform?: string;

  @IsString()
  @MaxLength(128)
  templateId!: string;

  @IsObject()
  payload!: Prisma.InputJsonValue;

  @IsEnum(LegalBasis)
  legalBasis!: LegalBasis;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
