import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@/generated/prisma/client.js'
import { DomainException } from '@/common/exceptions/domain.exception.js'

export interface ErrorResponseBody {
  statusCode: number
  errorCode: string
  message: string | string[]
  path: string
  method: string
  timestamp: string
  requestId: string
}

const PRISMA_ERROR_STATUS: Record<string, HttpStatus> = {
  P2002: HttpStatus.CONFLICT, // unique constraint violation
  P2025: HttpStatus.NOT_FOUND, // record not found
  P2003: HttpStatus.BAD_REQUEST, // foreign key constraint failed
}

const PRISMA_ERROR_CODE: Record<string, string> = {
  P2002: 'DUPLICATE_RECORD',
  P2025: 'RECORD_NOT_FOUND',
  P2003: 'INVALID_REFERENCE',
}

/**
 * Normalizes every unhandled error (Nest HttpException, Prisma errors, or
 * unexpected runtime errors) into a single, predictable JSON shape so API
 * consumers never have to branch on error source. Never leaks internal
 * stack traces or raw driver messages to clients — those are logged only.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()
    const requestId =
      (request.headers['x-request-id'] as string | undefined) ?? randomUUID()

    const { status, errorCode, message } = this.resolve(exception)

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const detail =
        exception instanceof Error
          ? (exception.stack ?? exception.message)
          : String(exception)
      this.logger.error(
        `[${requestId}] ${request.method} ${request.url} -> ${status}: ${detail}`,
      )
    } else {
      this.logger.warn(
        `[${requestId}] ${request.method} ${request.url} -> ${status}: ${String(message)}`,
      )
    }

    const body: ErrorResponseBody = {
      statusCode: status,
      errorCode,
      message,
      path: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
      requestId,
    }

    response.status(status).json(body)
  }

  private resolve(exception: unknown): {
    status: HttpStatus
    errorCode: string
    message: string | string[]
  } {
    if (exception instanceof DomainException) {
      return {
        status: exception.getStatus(),
        errorCode: exception.errorCode,
        message: exception.message,
      }
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const payload = exception.getResponse()
      const message = this.extractMessage(payload, exception.message)
      return { status, errorCode: this.errorCodeForStatus(status), message }
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const status =
        PRISMA_ERROR_STATUS[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR
      const errorCode = PRISMA_ERROR_CODE[exception.code] ?? 'DATABASE_ERROR'
      const message =
        status === HttpStatus.INTERNAL_SERVER_ERROR
          ? 'An unexpected database error occurred'
          : 'The request could not be completed due to a data conflict'
      return { status, errorCode, message }
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        errorCode: 'INVALID_DATABASE_QUERY',
        message: 'The request contained invalid data',
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    }
  }

  private extractMessage(
    payload: unknown,
    fallback: string,
  ): string | string[] {
    if (
      payload &&
      typeof payload === 'object' &&
      'message' in payload &&
      (typeof payload.message === 'string' || Array.isArray(payload.message))
    ) {
      return (payload as { message: string | string[] }).message
    }
    return fallback
  }

  private errorCodeForStatus(status: HttpStatus): string {
    return HttpStatus[status] ?? 'HTTP_ERROR'
  }
}
