import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FrameworkEntitlementsService } from './framework-entitlements.service';
import {
  FrameworkItemDto,
  FrameworkClauseItemDto,
  CustomFrameworkImportDto,
} from '@omnigrc/shared';

@Injectable()
export class FrameworksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly frameworkEntitlementsService: FrameworkEntitlementsService,
  ) {}

  async findAll(organizationId?: string): Promise<FrameworkItemDto[]> {
    const frameworks = await this.prisma.framework.findMany({
      include: {
        _count: { select: { clauses: true } },
      },
      orderBy: { code: 'asc' },
    });

    let entitledIds: string[] | null = null;
    if (organizationId) {
      entitledIds = await this.frameworkEntitlementsService.getEntitledFrameworkIds(organizationId);
    }

    const filtered = entitledIds !== null
      ? frameworks.filter((fw) => entitledIds!.includes(fw.id))
      : frameworks;

    return filtered.map((fw) => ({
      id: fw.id,
      code: fw.code,
      name: fw.name,
      description: `Reference security & compliance framework (${fw.code}).`,
      isSystem: true,
      clausesCount: fw._count.clauses,
      createdAt: fw.createdAt.toISOString(),
    }));
  }

  async findOne(organizationId: string, idOrCode: string): Promise<FrameworkItemDto> {
    await this.frameworkEntitlementsService.assertEntitled(organizationId, idOrCode);

    const framework = await this.prisma.framework.findFirst({
      where: {
        OR: [{ id: idOrCode }, { code: idOrCode as any }],
      },
      include: {
        clauses: { orderBy: { code: 'asc' } },
        _count: { select: { clauses: true } },
      },
    });

    if (!framework) {
      throw new NotFoundException(`Framework ${idOrCode} not found.`);
    }

    return {
      id: framework.id,
      code: framework.code,
      name: framework.name,
      description: `Reference security & compliance framework (${framework.code}).`,
      isSystem: true,
      clausesCount: framework._count.clauses,
      clauses: framework.clauses.map((c) => ({
        id: c.id,
        frameworkId: c.frameworkId,
        code: c.code,
        title: c.title,
        description: null,
      })),
      createdAt: framework.createdAt.toISOString(),
    };
  }

  async getVersions(organizationId: string, frameworkIdOrCode: string) {
    await this.frameworkEntitlementsService.assertEntitled(organizationId, frameworkIdOrCode);

    const fw = await this.prisma.framework.findFirst({
      where: {
        OR: [{ id: frameworkIdOrCode }, { code: frameworkIdOrCode as any }],
      },
    });
    if (!fw) {
      throw new NotFoundException(`Framework ${frameworkIdOrCode} not found.`);
    }

    const versions = await this.prisma.frameworkVersion.findMany({
      where: { frameworkId: fw.id },
      include: {
        _count: { select: { references: true } },
      },
      orderBy: { version: 'desc' },
    });

    return versions.map((v) => ({
      id: v.id,
      frameworkId: v.frameworkId,
      version: v.version,
      name: v.name,
      status: v.status,
      publisher: v.publisher,
      effectiveDate: v.effectiveDate ? v.effectiveDate.toISOString() : null,
      provenance: v.provenance as any,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
      referencesCount: v._count.references,
    }));
  }

  async getReferences(organizationId: string, versionId: string) {
    const version = await this.prisma.frameworkVersion.findUnique({
      where: { id: versionId },
    });

    if (!version) {
      throw new NotFoundException(`Framework Version with ID ${versionId} not found.`);
    }

    await this.frameworkEntitlementsService.assertEntitled(organizationId, version.frameworkId);

    const refs = await this.prisma.frameworkReference.findMany({
      where: { frameworkVersionId: versionId },
      orderBy: [{ sortOrder: 'asc' }, { identifier: 'asc' }],
    });

    return refs.map((r) => ({
      id: r.id,
      frameworkVersionId: r.frameworkVersionId,
      parentRefId: r.parentRefId,
      type: r.type,
      identifier: r.identifier,
      title: r.title,
      description: r.description,
      normativeText: r.normativeText,
      sortOrder: r.sortOrder,
      provenance: r.provenance as any,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async importCustomFramework(
    dto: CustomFrameworkImportDto,
  ): Promise<FrameworkItemDto> {
    if (!dto.code || !dto.name || !Array.isArray(dto.clauses) || dto.clauses.length === 0) {
      throw new BadRequestException('Framework import payload must contain code, name, and at least one clause.');
    }

    // Check if framework code exists
    const existing = await this.prisma.framework.findFirst({
      where: { code: dto.code as any },
    });

    if (existing) {
      throw new BadRequestException(`Framework with code ${dto.code} already exists.`);
    }

    // Validate clause code uniqueness
    const codes = new Set<string>();
    for (const c of dto.clauses) {
      if (!c.code || !c.title) {
        throw new BadRequestException('Each clause must contain a non-empty code and title.');
      }
      if (codes.has(c.code)) {
        throw new BadRequestException(`Duplicate clause code ${c.code} in import payload.`);
      }
      codes.add(c.code);
    }

    const versionStr = dto.version || '1.0';

    const created = await this.prisma.$transaction(async (tx) => {
      const fw = await tx.framework.create({
        data: {
          code: dto.code as any,
          name: dto.name,
          clauses: {
            create: dto.clauses.map((c) => ({
              code: c.code,
              title: c.title,
            })),
          },
          versions: {
            create: {
              version: versionStr,
              name: `${dto.name} v${versionStr}`,
              status: 'ACTIVE',
              publisher: 'Custom Import',
              provenance: { source: 'Custom Import' },
              references: {
                create: dto.clauses.map((c) => ({
                  type: 'CLAUSE',
                  identifier: c.code,
                  title: c.title,
                  description: c.description || c.title,
                })),
              },
            },
          },
        },
        include: {
          clauses: true,
          _count: { select: { clauses: true } },
        },
      });
      return fw;
    });

    return {
      id: created.id,
      code: created.code,
      name: created.name,
      description: dto.description || `Custom framework (${created.code}).`,
      isSystem: false,
      clausesCount: created._count.clauses,
      clauses: created.clauses.map((c) => ({
        id: c.id,
        frameworkId: c.frameworkId,
        code: c.code,
        title: c.title,
        description: null,
      })),
      createdAt: created.createdAt.toISOString(),
    };
  }
}
