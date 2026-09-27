import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OperatorsService } from './operators.service';
import { OperatorAuthService } from '../auth/operator-auth.service';
import { OperatorJwtGuard } from '../auth/operator-jwt.guard';
import { OperatorRbacGuard } from '../auth/operator-rbac.guard';
import { RequireOperatorRoles } from '../auth/operator-roles.decorator';
import { CreateOperatorDto, UpdateOperatorRoleDto } from './dto/operator.dto';
import { OperatorRole } from '@prisma/control-plane-client';

@Controller('v1/operators')
@UseGuards(OperatorJwtGuard, OperatorRbacGuard)
export class OperatorsController {
  constructor(
    private readonly operatorsService: OperatorsService,
    private readonly operatorAuthService: OperatorAuthService,
  ) {}

  @Get()
  @RequireOperatorRoles(OperatorRole.SECURITY_AUDIT, OperatorRole.PLATFORM_SUPER_ADMIN, OperatorRole.READ_ONLY_AUDITOR)
  async findAll() {
    return this.operatorsService.findAll();
  }

  @Get(':id')
  @RequireOperatorRoles(OperatorRole.SECURITY_AUDIT, OperatorRole.PLATFORM_SUPER_ADMIN, OperatorRole.READ_ONLY_AUDITOR)
  async findOne(@Param('id') id: string) {
    return this.operatorsService.findOne(id);
  }

  @Post()
  @RequireOperatorRoles(OperatorRole.SECURITY_AUDIT, OperatorRole.PLATFORM_SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createOperator(@Body() dto: CreateOperatorDto, @Req() req: any) {
    const actor = req.user;
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';

    return this.operatorsService.createOperator(dto, actor, ipAddress);
  }

  @Patch(':id/role')
  @RequireOperatorRoles(OperatorRole.PLATFORM_SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async updateRole(@Param('id') id: string, @Body() dto: UpdateOperatorRoleDto, @Req() req: any) {
    const actor = req.user;
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';

    return this.operatorsService.updateRole(id, dto, actor, ipAddress);
  }

  @Post(':id/suspend')
  @RequireOperatorRoles(OperatorRole.SECURITY_AUDIT, OperatorRole.PLATFORM_SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async suspend(@Param('id') id: string, @Req() req: any) {
    const actor = req.user;
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';

    return this.operatorsService.suspendOperator(id, actor, ipAddress);
  }

  @Post(':id/reactivate')
  @RequireOperatorRoles(OperatorRole.SECURITY_AUDIT, OperatorRole.PLATFORM_SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async reactivate(@Param('id') id: string, @Req() req: any) {
    const actor = req.user;
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';

    return this.operatorsService.reactivateOperator(id, actor, ipAddress);
  }

  @Post(':id/revoke-sessions')
  @RequireOperatorRoles(OperatorRole.SECURITY_AUDIT, OperatorRole.PLATFORM_SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async revokeSessions(@Param('id') id: string, @Req() req: any) {
    const actor = req.user;
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';

    const count = await this.operatorAuthService.revokeAllOperatorSessions(id, actor.id, ipAddress);
    return { success: true, revokedSessionsCount: count };
  }
}
