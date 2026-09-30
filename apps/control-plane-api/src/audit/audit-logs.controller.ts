import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OperatorRole } from '@prisma/control-plane-client';
import { OperatorJwtGuard } from '../auth/operator-jwt.guard';
import { OperatorRbacGuard } from '../auth/operator-rbac.guard';
import { RequireOperatorRoles } from '../auth/operator-roles.decorator';
import { ControlPlaneAuditLogsService, QueryAuditLogsDto } from './audit-logs.service';

@Controller('v1/audit')
@UseGuards(OperatorJwtGuard, OperatorRbacGuard)
export class AuditLogsController {
  constructor(private readonly auditLogsService: ControlPlaneAuditLogsService) {}

  /**
   * List Control Plane audit logs with server-side filtering and bounded pagination.
   * Scoped to authorized Control Plane audit roles: PLATFORM_SUPER_ADMIN, SECURITY_AUDIT, READ_ONLY_AUDITOR.
   */
  @Get()
  @RequireOperatorRoles(
    OperatorRole.PLATFORM_SUPER_ADMIN,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
  )
  async findAll(@Query() query: QueryAuditLogsDto) {
    return this.auditLogsService.findAll(query);
  }

  /**
   * View details of a specific Control Plane audit log record by ID.
   */
  @Get(':id')
  @RequireOperatorRoles(
    OperatorRole.PLATFORM_SUPER_ADMIN,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
  )
  async findOne(@Param('id') id: string) {
    return this.auditLogsService.findOne(id);
  }
}
