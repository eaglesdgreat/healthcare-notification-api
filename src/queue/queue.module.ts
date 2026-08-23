import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobsOptions } from 'bullmq';
import { ProvidersModule } from '../providers/providers.module';
import {
  AndroidPushNotificationProcessor,
  EmailNotificationProcessor,
  IosPushNotificationProcessor,
  SmsNotificationProcessor,
} from './notification.processor';
import { NotificationWorkerService } from './notification-worker.service';
import { QUEUE_NAMES } from './queue.constants';

const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          password: config.get<string>('redis.password'),
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.EMAIL, defaultJobOptions },
      { name: QUEUE_NAMES.SMS, defaultJobOptions },
      { name: QUEUE_NAMES.PUSH_IOS, defaultJobOptions },
      { name: QUEUE_NAMES.PUSH_ANDROID, defaultJobOptions },
    ),
    ProvidersModule,
  ],
  providers: [
    NotificationWorkerService,
    EmailNotificationProcessor,
    SmsNotificationProcessor,
    IosPushNotificationProcessor,
    AndroidPushNotificationProcessor,
  ],
  exports: [BullModule, NotificationWorkerService],
})
export class QueueModule {}
