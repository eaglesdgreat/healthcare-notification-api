import { jest } from '@jest/globals'
import { ExecutionContext } from '@nestjs/common'
import { EventEmitter } from 'node:events'
import { of } from 'rxjs'
import { HttpMetricsInterceptor } from '@/common/metrics/http-metrics.interceptor.js'
import type { MetricsService } from '@/common/metrics/metrics.service.js'

describe('HttpMetricsInterceptor', () => {
  let metrics: {
    observeHttpRequest: jest.MockedFunction<
      (
        method: string,
        route: string,
        statusCode: string,
        duration: number,
      ) => void
    >
  }
  let interceptor: HttpMetricsInterceptor

  beforeEach(() => {
    metrics = { observeHttpRequest: jest.fn() }
    interceptor = new HttpMetricsInterceptor(
      metrics as unknown as MetricsService,
    )
  })

  function createContext(url: string, method: string) {
    const response = Object.assign(new EventEmitter(), { statusCode: 200 })
    return {
      response,
      context: {
        switchToHttp: () => ({
          getRequest: () => ({ url, method, originalUrl: url }),
          getResponse: () => response,
        }),
        getClass: () => ({ name: 'TestController' }),
        getHandler: () => ({ name: 'testHandler' }),
      },
    }
  }

  it('records metrics using the final status code when the response finishes', () => {
    const { response, context } = createContext('/api/notifications', 'POST')

    interceptor
      .intercept(context as unknown as ExecutionContext, {
        handle: () => of({}),
      })
      .subscribe()
    response.emit('finish')

    expect(metrics.observeHttpRequest).toHaveBeenCalledWith(
      'POST',
      'TestController.testHandler',
      '200',
      expect.any(Number),
    )
  })

  it('skips health and metrics endpoints', () => {
    const metricsContext = createContext('/api/metrics', 'GET')

    interceptor
      .intercept(metricsContext.context as unknown as ExecutionContext, {
        handle: () => of({}),
      })
      .subscribe()
    metricsContext.response.emit('finish')

    expect(metrics.observeHttpRequest).not.toHaveBeenCalled()
  })
})
