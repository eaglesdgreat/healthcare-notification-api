import { Injectable } from '@nestjs/common'
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from 'prom-client'

/**
 * Central, type-safe wrapper around prom-client. It owns the metric registry,
 * bootstraps the default Node.js process metrics, and exposes focused recording
 * helpers so the rest of the service never has to build label sets by hand.
 */
@Injectable()
export class MetricsService {
  private readonly registry: Registry
  private readonly httpRequestDuration: Histogram<string>
  private readonly notificationsEnqueuedTotal: Counter<string>
  private readonly notificationsDeliveredTotal: Counter<string>

  constructor() {
    this.registry = new Registry()
    collectDefaultMetrics({
      register: this.registry,
    })

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request latency in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    })

    this.notificationsEnqueuedTotal = new Counter({
      name: 'notifications_enqueued_total',
      help: 'Total notifications enqueued for delivery, by channel',
      labelNames: ['channel'],
      registers: [this.registry],
    })

    this.notificationsDeliveredTotal = new Counter({
      name: 'notifications_delivered_total',
      help: 'Total delivery outcomes, by channel, provider, and outcome',
      labelNames: ['channel', 'provider', 'outcome'],
      registers: [this.registry],
    })
  }

  /** Record a single HTTP request's duration against its method/route/status. */
  observeHttpRequest(
    method: string,
    route: string,
    statusCode: string,
    durationSeconds: number,
  ): void {
    this.httpRequestDuration
      .labels(method, route, statusCode)
      .observe(durationSeconds)
  }

  /** Increment the enqueued counter for a notification channel. */
  incrementEnqueued(channel: string): void {
    this.notificationsEnqueuedTotal.labels(channel).inc()
  }

  /** Increment the delivery outcome counter (sent/failed/…) for a channel. */
  incrementDelivered(channel: string, provider: string, outcome: string): void {
    this.notificationsDeliveredTotal.labels(channel, provider, outcome).inc()
  }

  /** Serialize the full registry to the Prometheus text format. */
  async getMetrics(): Promise<string> {
    return this.registry.metrics()
  }

  /** Clear the registry (test teardown). */
  clear(): void {
    this.registry.clear()
  }
}
