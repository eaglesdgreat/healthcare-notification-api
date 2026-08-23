import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NotificationJobData } from './notification-job.interface';
import { NotificationWorkerService } from './notification-worker.service';
import { QUEUE_NAMES } from './queue.constants';

@Processor(QUEUE_NAMES.EMAIL)
export class EmailNotificationProcessor extends WorkerHost<NotificationJobData> {
  private readonly logger = new Logger(EmailNotificationProcessor.name);

  constructor(private readonly workerService: NotificationWorkerService) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    this.logger.log(`Processing email job ${job.id}`);
    await this.workerService.process(job.data.notificationId);
  }
}

@Processor(QUEUE_NAMES.SMS)
export class SmsNotificationProcessor extends WorkerHost<NotificationJobData> {
  private readonly logger = new Logger(SmsNotificationProcessor.name);

  constructor(private readonly workerService: NotificationWorkerService) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    this.logger.log(`Processing sms job ${job.id}`);
    await this.workerService.process(job.data.notificationId);
  }
}

@Processor(QUEUE_NAMES.PUSH_IOS)
export class IosPushNotificationProcessor extends WorkerHost<NotificationJobData> {
  private readonly logger = new Logger(IosPushNotificationProcessor.name);

  constructor(private readonly workerService: NotificationWorkerService) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    this.logger.log(`Processing ios push job ${job.id}`);
    await this.workerService.process(job.data.notificationId);
  }
}

@Processor(QUEUE_NAMES.PUSH_ANDROID)
export class AndroidPushNotificationProcessor extends WorkerHost<NotificationJobData> {
  private readonly logger = new Logger(AndroidPushNotificationProcessor.name);

  constructor(private readonly workerService: NotificationWorkerService) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    this.logger.log(`Processing android push job ${job.id}`);
    await this.workerService.process(job.data.notificationId);
  }
}
