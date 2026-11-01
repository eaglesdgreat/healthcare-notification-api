import { Module } from '@nestjs/common'
import { QueueModule } from '@/queue/queue.module.js'
import { NotificationController } from '@/notification/notification.controller.js'
import { NotificationService } from '@/notification/notification.service.js'
import { NotificationApiKeyGuard } from '@/notification/notification-api-key.guard.js'

@Module({
  imports: [QueueModule],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationApiKeyGuard],
})
export class NotificationModule {}
