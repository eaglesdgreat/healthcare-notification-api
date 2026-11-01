import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  Logger,
  UseGuards,
} from '@nestjs/common'
import type { Request } from 'express'
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { NotificationStatus } from '@/generated/prisma/enums.js'
import { PrismaService } from '@/prisma/prisma.service.js'
import { IdempotencyKeyRequiredException } from '@/common/exceptions/notification.exceptions.js'
import { NotificationNotFoundException } from '@/common/exceptions/notification.exceptions.js'
import { SendNotificationDto } from '@/notification/dto/send-notification.dto.js'
import { NotificationStatusResponseDto } from '@/notification/dto/notification-status-response.dto.js'
import { NotificationService } from '@/notification/notification.service.js'
import { NotificationApiKeyGuard } from '@/notification/notification-api-key.guard.js'
import { UpsertUserChannelDto } from '@/notification/dto/upsert-user-channel.dto.js'

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(NotificationApiKeyGuard)
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name)

  constructor(
    private readonly notificationService: NotificationService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('channels')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Register or update a user delivery channel',
    description:
      'Internal service endpoint used to register the delivery address for a user before queuing notifications.',
  })
  @ApiHeader({
    name: 'x-api-key',
    description: 'Internal service API key.',
    required: true,
  })
  @ApiResponse({ status: 204, description: 'Delivery channel saved.' })
  upsertChannel(@Body() dto: UpsertUserChannelDto): Promise<void> {
    return this.notificationService.upsertChannel(dto)
  }

  @Post()
  @HttpCode(202)
  @ApiOperation({
    summary: 'Queue a notification for delivery',
    description:
      'Accepts a notification request and enqueues it for asynchronous delivery via email, SMS, or push. Requests are deduplicated by the Idempotency-Key header.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Unique key used to deduplicate repeated send requests.',
    required: true,
  })
  @ApiHeader({
    name: 'x-api-key',
    description: 'Internal service API key.',
    required: true,
  })
  @ApiResponse({
    status: 202,
    description: 'Notification accepted and queued for delivery.',
    type: NotificationStatusResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or the Idempotency-Key header is missing.',
  })
  send(
    @Body() dto: SendNotificationDto,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Req() request?: Request & { id?: string },
  ): Promise<{ id: string; status: NotificationStatus }> {
    if (!idempotencyKey) {
      throw new IdempotencyKeyRequiredException()
    }
    return this.notificationService.send(dto, idempotencyKey, request?.id)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get the delivery status of a notification' })
  @ApiHeader({
    name: 'x-api-key',
    description: 'Internal service API key.',
    required: true,
  })
  @ApiParam({ name: 'id', description: 'Notification id (e.g. ntf_...)' })
  @ApiResponse({
    status: 200,
    description: 'The current notification status.',
    type: NotificationStatusResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Notification not found.' })
  async getStatus(
    @Param('id') id: string,
    @Req() request?: Request & { id?: string },
  ): Promise<{
    id: string
    status: NotificationStatus
    attempts: number
    providerMessageId: string | null
  }> {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        attempts: true,
        providerMessageId: true,
      },
    })
    if (!notification) {
      throw new NotificationNotFoundException(id)
    }
    this.logger.log({
      event: 'notification.status.read',
      notificationId: notification.id,
      status: notification.status,
      requestId: request?.id,
      message: 'Notification status retrieved',
    })
    return notification
  }
}
