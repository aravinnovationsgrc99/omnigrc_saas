import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  FrameworkItemDto,
  FrameworkClauseItemDto,
  CustomFrameworkImportDto,
} from '@omnigrc/shared';

@Injectable()
export class FrameworksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<FrameworkItemDto[]> {
    const frameworks = await this.prisma.framework.findMany({
      include: {
        _count: { select: { clauses: true } },
      },
      orderBy: { code: 'asc' },
    });

    return frameworks.map((fw) => ({
      id: fw.id,
      code: fw.code,
      name: fw.name,
      description: `Reference security & compliance framework (${fw.code}).`,
      isSystem: true,
      clausesCount: fw._count.clauses,
      createdAt: fw.createdAt.toISOString(),
    }));
  }

  async findOne(idOrCode: string): Promise<FrameworkItemDto> {
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
