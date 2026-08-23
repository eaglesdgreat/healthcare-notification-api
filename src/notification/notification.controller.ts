import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { NotificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { NotificationService } from './notification.service';

@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @HttpCode(202)
  send(
    @Body() dto: SendNotificationDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{ id: string; status: NotificationStatus }> {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    return this.notificationService.send(dto, idempotencyKey);
  }

  @Get(':id')
  async getStatus(@Param('id') id: string): Promise<{
    id: string;
    status: NotificationStatus;
    attempts: number;
    providerMessageId: string | null;
  }> {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        attempts: true,
        providerMessageId: true,
      },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return notification;
  }
}
