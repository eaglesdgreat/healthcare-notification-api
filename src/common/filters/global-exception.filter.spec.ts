import { jest } from '@jest/globals'
import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common'
import { Prisma } from '@/generated/prisma/client.js'
import { NotificationNotFoundException } from '@/common/exceptions/notification.exceptions.js'
import { GlobalExceptionFilter } from '@/common/filters/global-exception.filter.js'

function createHost(overrides?: { headers?: Record<string, string> }): {
  host: ArgumentsHost
  json: jest.MockedFunction<(body: unknown) => void>
  status: jest.MockedFunction<
    (code: number) => { json: (body: unknown) => void }
  >
} {
  const json = jest.fn<(body: unknown) => void>()
  const status = jest.fn<(code: number) => { json: (body: unknown) => void }>(
    () => ({ json }),
  )
  const response = { status }
  const request = {
    method: 'POST',
    url: '/api/notifications',
    headers: overrides?.headers ?? {},
  }
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost

  return { host, json, status }
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter

  beforeEach(() => {
    filter = new GlobalExceptionFilter()
  })

  it('maps domain exceptions to their declared status and errorCode', () => {
    const { host, json, status } = createHost()
    const exception = new NotificationNotFoundException('ntf_123')

    filter.catch(exception, host)

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        errorCode: 'NOTIFICATION_NOT_FOUND',
        message: 'Notification ntf_123 not found',
        path: '/api/notifications',
        method: 'POST',
      }),
    )
  })

  it('maps generic Nest HttpExceptions using their response payload', () => {
    const { host, json, status } = createHost()
    const exception = new BadRequestException('Bad input')

    filter.catch(exception, host)

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Bad input',
      }),
    )
  })

  it('maps Prisma unique-constraint errors to a 409 conflict', () => {
    const { host, json, status } = createHost()
    const exception = Object.assign(
      Object.create(
        Prisma.PrismaClientKnownRequestError.prototype,
      ) as Prisma.PrismaClientKnownRequestError,
      { code: 'P2002', message: 'duplicate' },
    )

    filter.catch(exception, host)

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.CONFLICT,
        errorCode: 'DUPLICATE_RECORD',
      }),
    )
  })

  it('falls back to a 500 for unrecognized errors without leaking internals', () => {
    const { host, json, status } = createHost()

    filter.catch(new Error('boom'), host)

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        errorCode: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      }),
    )
  })

  it('reuses an incoming x-request-id header when present', () => {
    const { host, json } = createHost({ headers: { 'x-request-id': 'req-42' } })

    filter.catch(new Error('boom'), host)

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-42' }),
    )
  })
})
