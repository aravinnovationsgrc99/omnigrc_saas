import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ControlPlanePrismaService } from '../prisma/prisma.service';
import { ControlPlaneAuditLogsService } from '../audit/audit-logs.service';
import {
  CustomerDto,
  CommercialAgreementDto,
  CreateCustomerDto,
  CreateCommercialAgreementDto,
} from '@omnigrc/shared';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: ControlPlanePrismaService,
    private readonly audit: ControlPlaneAuditLogsService,
  ) {}

  async createCustomer(dto: CreateCustomerDto): Promise<CustomerDto> {
    if (!dto.name) {
      throw new BadRequestException('Customer name is required');
    }

    const customer = await this.prisma.customer.create({
      data: { name: dto.name },
    });

    await this.audit.log('CUSTOMER_CREATED', 'Customer', customer.id, { name: customer.name });

    return {
      id: customer.id,
      name: customer.name,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  }

  async createCommercialAgreement(dto: CreateCommercialAgreementDto): Promise<CommercialAgreementDto> {
    if (!dto.customerId) {
      throw new BadRequestException('customerId is required for CommercialAgreement');
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID "${dto.customerId}" not found.`);
    }

    const agreement = await this.prisma.commercialAgreement.create({
      data: { customerId: dto.customerId },
    });

    await this.audit.log('COMMERCIAL_AGREEMENT_CREATED', 'CommercialAgreement', agreement.id, {
      customerId: agreement.customerId,
    });

    return {
      id: agreement.id,
      customerId: agreement.customerId,
      createdAt: agreement.createdAt.toISOString(),
      updatedAt: agreement.updatedAt.toISOString(),
    };
  }

  async findCustomer(id: string): Promise<CustomerDto> {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException(`Customer "${id}" not found`);
    return {
      id: customer.id,
      name: customer.name,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  }

  async findCommercialAgreement(id: string): Promise<CommercialAgreementDto> {
    const agreement = await this.prisma.commercialAgreement.findUnique({ where: { id } });
    if (!agreement) throw new NotFoundException(`CommercialAgreement "${id}" not found`);
    return {
      id: agreement.id,
      customerId: agreement.customerId,
      createdAt: agreement.createdAt.toISOString(),
      updatedAt: agreement.updatedAt.toISOString(),
    };
  }
}
