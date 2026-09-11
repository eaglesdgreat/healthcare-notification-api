import { Controller, Get, Header } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { MetricsService } from '@/common/metrics/metrics.service.js'

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({
    summary: 'Expose Prometheus text-format metrics for scraping.',
  })
  index(): Promise<string> {
    return this.metrics.getMetrics()
  }
}
