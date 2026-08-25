import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuditModule } from '@/audit/audit.module.js'
import configuration from '@/config/configuration.js'
import { HealthModule } from '@/health/health.module.js'
import { NotificationModule } from '@/notification/notification.module.js'
import { PrismaModule } from '@/prisma/prisma.module.js'
import { QueueModule } from '@/queue/queue.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    PrismaModule,
    AuditModule,
    QueueModule,
    NotificationModule,
    HealthModule,
  ],
})
export class AppModule {}
