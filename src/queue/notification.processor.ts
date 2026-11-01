import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { NotificationJobData } from '@/queue/notification-job.interface.js'
import { NotificationWorkerService } from '@/queue/notification-worker.service.js'
import { QUEUE_NAMES } from '@/queue/queue.constants.js'

@Processor(QUEUE_NAMES.EMAIL)
export class EmailNotificationProcessor extends WorkerHost {
  constructor(private readonly workerService: NotificationWorkerService) {
    super()
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    await this.workerService.process(
      job.data.notificationId,
      job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
      job.data.requestId,
    )
  }
}

@Processor(QUEUE_NAMES.SMS)
export class SmsNotificationProcessor extends WorkerHost {
  constructor(private readonly workerService: NotificationWorkerService) {
    super()
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    await this.workerService.process(
      job.data.notificationId,
      job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
      job.data.requestId,
    )
  }
}

@Processor(QUEUE_NAMES.PUSH_IOS)
export class IosPushNotificationProcessor extends WorkerHost {
  constructor(private readonly workerService: NotificationWorkerService) {
    super()
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    await this.workerService.process(
      job.data.notificationId,
      job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
      job.data.requestId,
    )
  }
}

@Processor(QUEUE_NAMES.PUSH_ANDROID)
export class AndroidPushNotificationProcessor extends WorkerHost {
  constructor(private readonly workerService: NotificationWorkerService) {
    super()
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    await this.workerService.process(
      job.data.notificationId,
      job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
      job.data.requestId,
    )
  }
}
