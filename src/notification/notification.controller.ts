import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common'
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

@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly prisma: PrismaService,
  ) {}

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
  ): Promise<{ id: string; status: NotificationStatus }> {
    if (!idempotencyKey) {
      throw new IdempotencyKeyRequiredException()
    }
    return this.notificationService.send(dto, idempotencyKey)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get the delivery status of a notification' })
  @ApiParam({ name: 'id', description: 'Notification id (e.g. ntf_...)' })
  @ApiResponse({
    status: 200,
    description: 'The current notification status.',
    type: NotificationStatusResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Notification not found.' })
  async getStatus(@Param('id') id: string): Promise<{
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
    return notification
  }
}
