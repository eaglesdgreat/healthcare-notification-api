import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actor: string;
  action: string;
  resourceType: string;
  resourceId: string;
  status: string;
  region: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    // Store pseudonymized metadata only — never raw PHI.
    await this.prisma.auditLog.create({
      data: {
        actor: entry.actor,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        status: entry.status,
        region: entry.region,
        metadata: entry.metadata,
      },
    });
    this.logger.log(
      `[audit] ${entry.actor} ${entry.action} ${entry.resourceType}:${entry.resourceId} -> ${entry.status}`,
    );
  }
}
