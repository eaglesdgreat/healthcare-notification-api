import { Module } from '@nestjs/common'
import { QueueModule } from '../queue/queue.module.js'
import { NotificationController } from './notification.controller.js'
import { NotificationService } from './notification.service.js'

@Module({
  imports: [QueueModule],
  controllers: [NotificationController],
  providers: [NotificationService],
})
export class NotificationModule {}
