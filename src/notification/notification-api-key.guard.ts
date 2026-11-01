import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { timingSafeEqual } from 'node:crypto'
import type { Request } from 'express'

@Injectable()
export class NotificationApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('NOTIFICATION_API_KEY')
    const provided = context
      .switchToHttp()
      .getRequest<Request>()
      .header('x-api-key')

    if (
      !expected ||
      Buffer.byteLength(expected) < 32 ||
      !provided ||
      Buffer.byteLength(expected) !== Buffer.byteLength(provided) ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
    ) {
      throw new UnauthorizedException('Invalid service credentials')
    }

    return true
  }
}
