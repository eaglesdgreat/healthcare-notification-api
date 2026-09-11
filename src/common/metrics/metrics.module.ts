import { Global, Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { HttpMetricsInterceptor } from '@/common/metrics/http-metrics.interceptor.js'
import { MetricsController } from '@/common/metrics/metrics.controller.js'
import { MetricsService } from '@/common/metrics/metrics.service.js'

@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    MetricsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
