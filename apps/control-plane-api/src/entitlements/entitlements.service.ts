import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ControlPlanePrismaService } from '../prisma/prisma.service';
import { ControlPlaneAuditLogsService } from '../audit/audit-logs.service';
import { EntitlementDto, CreateEntitlementDto } from '@omnigrc/shared';

@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: ControlPlanePrismaService,
    private readonly audit: ControlPlaneAuditLogsService,
  ) {}

  async createEntitlement(dto: CreateEntitlementDto): Promise<EntitlementDto> {
    if (!dto.licenseId) {
      throw new BadRequestException('licenseId is required for entitlement creation');
    }
    if (!dto.code || typeof dto.code !== 'string' || dto.code.trim() === '') {
      throw new BadRequestException('entitlement code is required');
    }
    if (!dto.name || typeof dto.name !== 'string' || dto.name.trim() === '') {
      throw new BadRequestException('entitlement name is required');
    }

    const license = await this.prisma.license.findUnique({
      where: { id: dto.licenseId },
    });

    if (!license) {
      throw new NotFoundException(`License with ID "${dto.licenseId}" not found.`);
    }

    // Validate value if provided
    let jsonValue: any = null;
    if (dto.value !== undefined) {
      try {
        jsonValue = JSON.parse(JSON.stringify(dto.value));
      } catch (err) {
        throw new BadRequestException('Invalid JSON payload for entitlement value');
      }
    }

    const entitlement = await this.prisma.entitlement.create({
      data: {
        licenseId: dto.licenseId,
        code: dto.code.trim(),
        name: dto.name.trim(),
        value: jsonValue,
        enabled: dto.enabled ?? true,
      },
    });

    await this.audit.log('ENTITLEMENT_CREATED', 'Entitlement', entitlement.id, {
      licenseId: entitlement.licenseId,
      code: entitlement.code,
    });

    return {
      id: entitlement.id,
      licenseId: entitlement.licenseId,
      code: entitlement.code,
      name: entitlement.name,
      value: entitlement.value,
      enabled: entitlement.enabled,
      createdAt: entitlement.createdAt.toISOString(),
      updatedAt: entitlement.updatedAt.toISOString(),
    };
  }

  async findOne(id: string): Promise<EntitlementDto> {
    const e = await this.prisma.entitlement.findUnique({
      where: { id },
    });

    if (!e) {
      throw new NotFoundException(`Entitlement with ID "${id}" not found.`);
    }

    return {
      id: e.id,
      licenseId: e.licenseId,
      code: e.code,
      name: e.name,
      value: e.value,
      enabled: e.enabled,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }

  async findByLicense(licenseId: string): Promise<EntitlementDto[]> {
    const license = await this.prisma.license.findUnique({
      where: { id: licenseId },
    });

    if (!license) {
      throw new NotFoundException(`License with ID "${licenseId}" not found.`);
    }

    const entitlements = await this.prisma.entitlement.findMany({
      where: { licenseId },
      orderBy: { createdAt: 'asc' },
    });

    return entitlements.map((e) => ({
      id: e.id,
      licenseId: e.licenseId,
      code: e.code,
      name: e.name,
      value: e.value,
      enabled: e.enabled,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    }));
  }
}
