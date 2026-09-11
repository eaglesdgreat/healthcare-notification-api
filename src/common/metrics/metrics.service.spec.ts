import { MetricsService } from '@/common/metrics/metrics.service.js'

describe('MetricsService', () => {
  let service: MetricsService

  beforeEach(() => {
    service = new MetricsService()
  })

  afterEach(() => {
    service.clear()
  })

  it('exposes default Node.js process metrics', async () => {
    const metrics = await service.getMetrics()
    expect(metrics).toContain('process_cpu_seconds_total')
  })

  it('increments the enqueued counter by channel', async () => {
    service.incrementEnqueued('email')
    service.incrementEnqueued('email')

    const metrics = await service.getMetrics()
    expect(metrics).toContain('notifications_enqueued_total{channel="email"} 2')
  })

  it('increments the delivered counter by channel, provider, and outcome', async () => {
    service.incrementDelivered('email', 'console', 'sent')

    const metrics = await service.getMetrics()
    expect(metrics).toContain(
      'notifications_delivered_total{channel="email",provider="console",outcome="sent"} 1',
    )
  })

  it('records HTTP request duration by method, route, and status code', async () => {
    service.observeHttpRequest('GET', '/api/notifications', '202', 0.123)

    const metrics = await service.getMetrics()
    expect(metrics).toContain(
      'http_request_duration_seconds_count{method="GET",route="/api/notifications",status_code="202"} 1',
    )
  })
})
