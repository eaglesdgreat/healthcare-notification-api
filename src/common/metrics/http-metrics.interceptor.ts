import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { Observable } from 'rxjs'
import { MetricsService } from '@/common/metrics/metrics.service.js'

/** Infrastructure traffic that must not distort service request metrics. */
const EXCLUDED_PATH_PREFIXES = ['/api/health', '/api/metrics']

/**
 * Records HTTP request count and latency by method, matched route, and status
 * code. It hooks the response "finish" event so the final status code is used
 * even when an exception is handled later by the global exception filter.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp()
    const request = http.getRequest<Request>()
    const response = http.getResponse<Response>()

    if (this.isExcluded(request.url ?? request.originalUrl)) {
      return next.handle()
    }

    const start = process.hrtime.bigint()
    const method = request.method ?? 'UNKNOWN'
    const route = this.resolveRoute(context, request)

    response.once('finish', () => {
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9
      this.metrics.observeHttpRequest(
        method,
        route,
        String(response.statusCode),
        durationSeconds,
      )
    })

    return next.handle()
  }

  private isExcluded(url: string): boolean {
    return EXCLUDED_PATH_PREFIXES.some((prefix) => url.startsWith(prefix))
  }

  private resolveRoute(context: ExecutionContext, request: Request): string {
    // Prefer the Express route pattern when available (e.g. "/notifications/:id")
    // and fall back to a stable controller.handler label otherwise.
    const routePath = (request.route as { path?: string } | undefined)?.path
    return (
      routePath ?? `${context.getClass().name}.${context.getHandler().name}`
    )
  }
}
