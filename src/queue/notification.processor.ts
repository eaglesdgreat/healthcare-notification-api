import { Logger } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { NotificationJobData } from '@/queue/notification-job.interface.js'
import { NotificationWorkerService } from '@/queue/notification-worker.service.js'
import { QUEUE_NAMES } from '@/queue/queue.constants.js'

@Processor(QUEUE_NAMES.EMAIL)
export class EmailNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailNotificationProcessor.name)

  constructor(private readonly workerService: NotificationWorkerService) {
    super()
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    this.logger.log(`Processing email job ${job.id}`)
    await this.workerService.process(job.data.notificationId)
  }
}

@Processor(QUEUE_NAMES.SMS)
export class SmsNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(SmsNotificationProcessor.name)

  constructor(private readonly workerService: NotificationWorkerService) {
    super()
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    this.logger.log(`Processing sms job ${job.id}`)
    await this.workerService.process(job.data.notificationId)
  }
}

@Processor(QUEUE_NAMES.PUSH_IOS)
export class IosPushNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(IosPushNotificationProcessor.name)

  constructor(private readonly workerService: NotificationWorkerService) {
    super()
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    this.logger.log(`Processing ios push job ${job.id}`)
    await this.workerService.process(job.data.notificationId)
  }
}

@Processor(QUEUE_NAMES.PUSH_ANDROID)
export class AndroidPushNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(AndroidPushNotificationProcessor.name)

  constructor(private readonly workerService: NotificationWorkerService) {
    super()
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    this.logger.log(`Processing android push job ${job.id}`)
    await this.workerService.process(job.data.notificationId)
  }
}
