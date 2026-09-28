import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { OperatorJwtGuard } from '../auth/operator-jwt.guard';
import { OperatorRbacGuard } from '../auth/operator-rbac.guard';
import { RequireOperatorRoles } from '../auth/operator-roles.decorator';
import { ControlPlaneAuditLogsService } from '../audit/audit-logs.service';
import { CreateCustomerDto, CreateCommercialAgreementDto } from '@omnigrc/shared';
import { OperatorRole } from '@prisma/control-plane-client';

@Controller('v1')
@UseGuards(OperatorJwtGuard, OperatorRbacGuard)
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly auditLogsService: ControlPlaneAuditLogsService,
  ) {}

  @Post('customers')
  @RequireOperatorRoles(OperatorRole.COMMERCIAL_OPERATOR, OperatorRole.PLATFORM_SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createCustomer(@Body() dto: CreateCustomerDto, @Req() req: any) {
    const customer = await this.customersService.createCustomer(dto);

    await this.auditLogsService.log({
      action: 'CUSTOMER_CREATED',
      entityType: 'CUSTOMER',
      entityId: customer.id,
      actorId: req.user?.id,
      actorRole: req.user?.role,
      ipAddress: req.ip,
      correlationId: req.correlationId,
      result: 'SUCCESS',
      metadata: { name: customer.name },
    });

    return customer;
  }

  @Get('customers')
  @RequireOperatorRoles(
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.OPERATIONS_ENGINEER,
    OperatorRole.SUPPORT_ENGINEER,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
    OperatorRole.PLATFORM_SUPER_ADMIN,
  )
  async findAllCustomers() {
    return this.customersService.findAllCustomers();
  }

  @Get('customers/:id')
  @RequireOperatorRoles(
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.SUPPORT_ENGINEER,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
    OperatorRole.PLATFORM_SUPER_ADMIN,
  )
  async findCustomer(@Param('id') id: string) {
    return this.customersService.findCustomer(id);
  }

  @Post('commercial-agreements')
  @RequireOperatorRoles(OperatorRole.COMMERCIAL_OPERATOR, OperatorRole.PLATFORM_SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createCommercialAgreement(@Body() dto: CreateCommercialAgreementDto, @Req() req: any) {
    const agreement = await this.customersService.createCommercialAgreement(dto);

    await this.auditLogsService.log({
      action: 'COMMERCIAL_AGREEMENT_CREATED',
      entityType: 'COMMERCIAL_AGREEMENT',
      entityId: agreement.id,
      actorId: req.user?.id,
      actorRole: req.user?.role,
      ipAddress: req.ip,
      correlationId: req.correlationId,
      result: 'SUCCESS',
      metadata: { customerId: agreement.customerId },
    });

    return agreement;
  }

  @Get('commercial-agreements')
  @RequireOperatorRoles(
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.OPERATIONS_ENGINEER,
    OperatorRole.SUPPORT_ENGINEER,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
    OperatorRole.PLATFORM_SUPER_ADMIN,
  )
  async findAllAgreements(@Query('customerId') customerId?: string) {
    return this.customersService.findAllAgreements(customerId);
  }

  @Get('commercial-agreements/:id')
  @RequireOperatorRoles(
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.SUPPORT_ENGINEER,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
    OperatorRole.PLATFORM_SUPER_ADMIN,
  )
  async findCommercialAgreement(@Param('id') id: string) {
    return this.customersService.findCommercialAgreement(id);
  }
}
