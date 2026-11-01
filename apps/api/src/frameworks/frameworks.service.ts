import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FrameworkEntitlementsService } from './framework-entitlements.service';
import {
  FrameworkItemDto,
  FrameworkClauseItemDto,
  CustomFrameworkImportDto,
  FrameworkCode,
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
        versions: {
          where: { status: 'ACTIVE' },
          orderBy: { version: 'desc' },
          select: {
            version: true,
            _count: { select: { references: true } },
          },
        },
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

    return filtered.map((fw) => {
      const activeVersion = fw.versions?.[0];
      const authoritativeCount = (activeVersion?._count?.references && activeVersion._count.references > 0)
        ? activeVersion._count.references
        : fw._count.clauses;
      return {
        id: fw.id,
        code: fw.code,
        name: fw.name,
        description: `Reference security & compliance framework (${fw.code}).`,
        version: activeVersion?.version || null,
        isSystem: true,
        clausesCount: authoritativeCount,
        createdAt: fw.createdAt.toISOString(),
      };
    });
  }

  async findOne(organizationId: string, idOrCode: string, versionId?: string): Promise<FrameworkItemDto> {
    await this.frameworkEntitlementsService.assertEntitled(organizationId, idOrCode);

    const isEnumCode = Object.values(FrameworkCode).includes(idOrCode as FrameworkCode);
    const framework = await this.prisma.framework.findFirst({
      where: isEnumCode
        ? { OR: [{ id: idOrCode }, { code: idOrCode as FrameworkCode }] }
        : { id: idOrCode },
      include: {
        clauses: { orderBy: { code: 'asc' } },
        versions: {
          where: versionId ? { id: versionId } : { status: 'ACTIVE' },
          orderBy: { version: 'desc' },
          include: {
            references: {
              orderBy: [{ sortOrder: 'asc' }, { identifier: 'asc' }],
            },
            _count: { select: { references: true } },
          },
        },
        _count: { select: { clauses: true } },
      },
    });

    if (!framework) {
      throw new NotFoundException(`Framework ${idOrCode} not found.`);
    }

    const activeVersion = framework.versions?.[0];
    let resolvedClauses: FrameworkClauseItemDto[];
    let clausesCount = framework._count.clauses;

    if (activeVersion && activeVersion.references && activeVersion.references.length > 0) {
      resolvedClauses = activeVersion.references.map((r) => ({
        id: r.id,
        frameworkId: framework.id,
        code: r.identifier,
        title: r.title,
        description: r.description || null,
      }));
      clausesCount = activeVersion.references.length;
    } else {
      resolvedClauses = framework.clauses.map((c) => ({
        id: c.id,
        frameworkId: c.frameworkId,
        code: c.code,
        title: c.title,
        description: null,
      }));
    }

    return {
      id: framework.id,
      code: framework.code,
      name: framework.name,
      description: `Reference security & compliance framework (${framework.code}).`,
      version: activeVersion?.version || null,
      isSystem: true,
      clausesCount,
      clauses: resolvedClauses,
      createdAt: framework.createdAt.toISOString(),
    };
  }

  async getVersions(organizationId: string, frameworkIdOrCode: string) {
    await this.frameworkEntitlementsService.assertEntitled(organizationId, frameworkIdOrCode);

    const isEnumCode = Object.values(FrameworkCode).includes(frameworkIdOrCode as FrameworkCode);
    const fw = await this.prisma.framework.findFirst({
      where: isEnumCode
        ? { OR: [{ id: frameworkIdOrCode }, { code: frameworkIdOrCode as FrameworkCode }] }
        : { id: frameworkIdOrCode },
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

  async getVersionClauses(
    organizationId: string,
    frameworkIdOrCode: string,
    versionId: string,
    options?: { search?: string; type?: string; page?: number; limit?: number },
  ) {
    await this.frameworkEntitlementsService.assertEntitled(organizationId, frameworkIdOrCode);

    const isEnumCode = Object.values(FrameworkCode).includes(frameworkIdOrCode as FrameworkCode);
    const fw = await this.prisma.framework.findFirst({
      where: isEnumCode
        ? { OR: [{ id: frameworkIdOrCode }, { code: frameworkIdOrCode as FrameworkCode }] }
        : { id: frameworkIdOrCode },
    });
    if (!fw) {
      throw new NotFoundException(`Framework ${frameworkIdOrCode} not found.`);
    }

    const version = await this.prisma.frameworkVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) {
      throw new NotFoundException(`Framework Version with ID ${versionId} not found.`);
    }

    // Verify relational integrity: version belongs to the framework
    if (version.frameworkId !== fw.id) {
      throw new BadRequestException(
        `Framework Version "${versionId}" does not belong to Framework "${frameworkIdOrCode}".`,
      );
    }

    // Also assert version-level entitlement
    await this.frameworkEntitlementsService.assertEntitled(organizationId, fw.id, version.id);

    const where: any = { frameworkVersionId: version.id };
    if (options?.type) {
      where.type = options.type;
    }
    if (options?.search && options.search.trim()) {
      const term = options.search.trim();
      where.OR = [
        { identifier: { contains: term, mode: 'insensitive' } },
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    const refs = await this.prisma.frameworkReference.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { identifier: 'asc' }],
      take: options?.limit ? Math.min(options.limit, 1000) : undefined,
      skip: options?.page && options?.limit ? (options.page - 1) * options.limit : undefined,
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

  async getReferences(
    organizationId: string,
    versionId: string,
    options?: { search?: string; type?: string; page?: number; limit?: number },
  ) {
    const version = await this.prisma.frameworkVersion.findUnique({
      where: { id: versionId },
    });

    if (!version) {
      throw new NotFoundException(`Framework Version with ID ${versionId} not found.`);
    }

    await this.frameworkEntitlementsService.assertEntitled(organizationId, version.frameworkId, version.id);

    const where: any = { frameworkVersionId: versionId };
    if (options?.type) {
      where.type = options.type;
    }
    if (options?.search && options.search.trim()) {
      const term = options.search.trim();
      where.OR = [
        { identifier: { contains: term, mode: 'insensitive' } },
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    const refs = await this.prisma.frameworkReference.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { identifier: 'asc' }],
      take: options?.limit ? Math.min(options.limit, 1000) : undefined,
      skip: options?.page && options?.limit ? (options.page - 1) * options.limit : undefined,
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

  async getReference(organizationId: string, refId: string) {
    const ref = await this.prisma.frameworkReference.findUnique({
      where: { id: refId },
      include: {
        frameworkVersion: {
          select: { id: true, frameworkId: true, version: true, name: true },
        },
      },
    });

    if (!ref) {
      throw new NotFoundException(`Framework reference "${refId}" not found.`);
    }

    await this.frameworkEntitlementsService.assertEntitled(
      organizationId,
      ref.frameworkVersion.frameworkId,
      ref.frameworkVersionId,
    );

    return {
      id: ref.id,
      frameworkVersionId: ref.frameworkVersionId,
      frameworkId: ref.frameworkVersion.frameworkId,
      version: ref.frameworkVersion.version,
      versionName: ref.frameworkVersion.name,
      identifier: ref.identifier,
      title: ref.title,
      description: ref.description,
      normativeText: ref.normativeText,
      sortOrder: ref.sortOrder,
    };
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
