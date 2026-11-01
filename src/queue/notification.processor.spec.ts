import { jest } from '@jest/globals'
import type { Job } from 'bullmq'
import {
  AndroidPushNotificationProcessor,
  EmailNotificationProcessor,
  IosPushNotificationProcessor,
  SmsNotificationProcessor,
} from '@/queue/notification.processor.js'
import type { NotificationJobData } from '@/queue/notification-job.interface.js'
import type { NotificationWorkerService } from '@/queue/notification-worker.service.js'

describe.each([
  ['email', EmailNotificationProcessor],
  ['sms', SmsNotificationProcessor],
  ['iOS push', IosPushNotificationProcessor],
  ['Android push', AndroidPushNotificationProcessor],
] as const)('%s processor', (_name, Processor) => {
  it('forwards the request ID and retry state to the worker', async () => {
    const worker = {
      process: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    }
    const processor = new Processor(
      worker as unknown as NotificationWorkerService,
    )
    const job = {
      id: 'job-1',
      data: { notificationId: 'ntf-1', requestId: 'req-1' },
      attemptsMade: 1,
      opts: { attempts: 5 },
    } as Job<NotificationJobData>

    await processor.process(job)

    expect(worker.process).toHaveBeenCalledWith('ntf-1', false, 'req-1')
  })
})
