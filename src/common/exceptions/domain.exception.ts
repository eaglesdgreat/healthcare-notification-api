import { HttpException, HttpStatus } from '@nestjs/common'

/**
 * Base class for all domain-specific exceptions. Every subclass carries a
 * stable machine-readable `errorCode` (surfaced in the JSON error response by
 * the global exception filter) so API consumers can branch on error type
 * without parsing human-readable messages.
 */
export abstract class DomainException extends HttpException {
  abstract readonly errorCode: string

  protected constructor(message: string, status: HttpStatus) {
    super(message, status)
  }
}
