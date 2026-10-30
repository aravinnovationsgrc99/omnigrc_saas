import { Injectable, NotFoundException } from '@nestjs/common';
import { DataPlanePrismaService } from './data-plane-prisma.service';

export interface RegulatoryFrameworkMetadata {
  category: string;
  jurisdiction: string;
  issuingAuthority: string;
  instrumentType: string;
  officialReferenceUrl?: string;
}

const CANONICAL_FRAMEWORK_METADATA: Record<string, RegulatoryFrameworkMetadata> = {
  ISO27001: {
    category: 'Information Security',
    jurisdiction: 'Global / International',
    issuingAuthority: 'International Organization for Standardization (ISO / IEC)',
    instrumentType: 'International Standard',
    officialReferenceUrl: 'https://www.iso.org/standard/27001',
  },
  ISO42001: {
    category: 'AI Governance & Safety',
    jurisdiction: 'Global / International',
    issuingAuthority: 'International Organization for Standardization (ISO / IEC)',
    instrumentType: 'International Standard',
    officialReferenceUrl: 'https://www.iso.org/standard/81230.html',
  },
  SOC2: {
    category: 'Cloud Security & Assurance',
    jurisdiction: 'United States (US AICPA)',
    issuingAuthority: 'American Institute of CPAs (AICPA)',
    instrumentType: 'Trust Services Criteria (TSC 2017)',
    officialReferenceUrl: 'https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services',
  },
  GDPR: {
    category: 'Data Privacy & Protection',
    jurisdiction: 'European Union (EU)',
    issuingAuthority: 'European Parliament and Council of the European Union',
    instrumentType: 'Statutory Regulation (Regulation (EU) 2016/679)',
    officialReferenceUrl: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj',
  },
  DPDP: {
    category: 'Data Privacy & Governance',
    jurisdiction: 'India',
    issuingAuthority: 'Ministry of Electronics and Information Technology (MeitY) / DPBI',
    instrumentType: 'Primary Legislation (Act No. 22 of 2023)',
    officialReferenceUrl: 'https://www.meity.gov.in/data-protection-framework',
  },
  HIPAA: {
    category: 'Healthcare Security & Privacy',
    jurisdiction: 'United States (US Federal)',
    issuingAuthority: 'U.S. Department of Health and Human Services (HHS / OCR)',
    instrumentType: 'Federal Statutory Regulation (45 CFR Parts 160, 162, 164)',
    officialReferenceUrl: 'https://www.hhs.gov/hipaa/for-professionals/security/index.html',
  },
};

export interface QueryFrameworksDto {
  search?: string;
  jurisdiction?: string;
  category?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class ControlPlaneFrameworksService {
  constructor(private readonly dataPlanePrisma: DataPlanePrismaService) {}

  /**
   * List all regulatory compliance frameworks with versions, counts, and metadata
   */
  async listFrameworks(query?: QueryFrameworksDto) {
    const frameworks = await this.dataPlanePrisma.framework.findMany({
      include: {
        versions: {
          include: {
            _count: { select: { references: true, entitlements: true } },
          },
          orderBy: { version: 'desc' },
        },
        _count: {
          select: { clauses: true, entitlements: true },
        },
      },
      orderBy: { code: 'asc' },
    });

    const enriched = frameworks.map((fw) => {
      const meta = CANONICAL_FRAMEWORK_METADATA[fw.code] || {
        category: 'Governance & Compliance',
        jurisdiction: 'General',
        issuingAuthority: 'Standard Authority',
        instrumentType: 'Compliance Framework',
      };

      const totalReferences = fw.versions.reduce(
        (sum, v) => sum + (v._count?.references || 0),
        0,
      );

      const latestVersion = fw.versions.length > 0 ? fw.versions[0] : null;

      return {
        id: fw.id,
        code: fw.code,
        name: fw.name,
        category: meta.category,
        jurisdiction: meta.jurisdiction,
        issuingAuthority: meta.issuingAuthority,
        instrumentType: meta.instrumentType,
        officialReferenceUrl: meta.officialReferenceUrl || null,
        versionsCount: fw.versions.length,
        clausesCount: fw._count.clauses,
        totalReferencesCount: totalReferences,
        entitledOrganizationsCount: fw._count.entitlements,
        latestVersion: latestVersion
          ? {
              id: latestVersion.id,
              version: latestVersion.version,
              name: latestVersion.name,
              status: latestVersion.status,
              publisher: latestVersion.publisher,
              effectiveDate: latestVersion.effectiveDate?.toISOString() || null,
              referencesCount: latestVersion._count.references,
            }
          : null,
        versions: fw.versions.map((v) => ({
          id: v.id,
          version: v.version,
          name: v.name,
          status: v.status,
          publisher: v.publisher,
          effectiveDate: v.effectiveDate?.toISOString() || null,
          referencesCount: v._count.references,
          entitlementsCount: v._count.entitlements,
          createdAt: v.createdAt.toISOString(),
        })),
        createdAt: fw.createdAt.toISOString(),
      };
    });

    // In-memory filter if query params provided
    let results = enriched;

    if (query?.search) {
      const q = query.search.trim().toLowerCase();
      results = results.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.code.toLowerCase().includes(q) ||
          f.issuingAuthority.toLowerCase().includes(q) ||
          f.jurisdiction.toLowerCase().includes(q),
      );
    }

    if (query?.jurisdiction && query.jurisdiction !== 'ALL') {
      const jur = query.jurisdiction.toLowerCase();
      results = results.filter((f) => f.jurisdiction.toLowerCase().includes(jur));
    }

    if (query?.category && query.category !== 'ALL') {
      const cat = query.category.toLowerCase();
      results = results.filter((f) => f.category.toLowerCase().includes(cat));
    }

    const total = results.length;
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query?.limit) || 20));
    const paginated = results.slice((page - 1) * limit, page * limit);

    return {
      data: paginated,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Get single framework by ID or Enum Code with full details
   */
  async getFramework(idOrCode: string) {
    const isCode = Object.keys(CANONICAL_FRAMEWORK_METADATA).includes(idOrCode.toUpperCase());
    const framework = await this.dataPlanePrisma.framework.findFirst({
      where: isCode
        ? { OR: [{ id: idOrCode }, { code: idOrCode.toUpperCase() as any }] }
        : { id: idOrCode },
      include: {
        versions: {
          include: {
            _count: { select: { references: true, entitlements: true } },
          },
          orderBy: { version: 'desc' },
        },
        _count: {
          select: { clauses: true, entitlements: true },
        },
      },
    });

    if (!framework) {
      throw new NotFoundException(`Regulatory Framework [${idOrCode}] not found.`);
    }

    const meta = CANONICAL_FRAMEWORK_METADATA[framework.code] || {
      category: 'Governance & Compliance',
      jurisdiction: 'General',
      issuingAuthority: 'Standard Authority',
      instrumentType: 'Compliance Framework',
    };

    const totalReferences = framework.versions.reduce(
      (sum, v) => sum + (v._count?.references || 0),
      0,
    );

    return {
      id: framework.id,
      code: framework.code,
      name: framework.name,
      category: meta.category,
      jurisdiction: meta.jurisdiction,
      issuingAuthority: meta.issuingAuthority,
      instrumentType: meta.instrumentType,
      officialReferenceUrl: meta.officialReferenceUrl || null,
      versionsCount: framework.versions.length,
      clausesCount: framework._count.clauses,
      totalReferencesCount: totalReferences,
      entitledOrganizationsCount: framework._count.entitlements,
      versions: framework.versions.map((v) => ({
        id: v.id,
        version: v.version,
        name: v.name,
        status: v.status,
        publisher: v.publisher,
        effectiveDate: v.effectiveDate?.toISOString() || null,
        referencesCount: v._count.references,
        entitlementsCount: v._count.entitlements,
        createdAt: v.createdAt.toISOString(),
      })),
      createdAt: framework.createdAt.toISOString(),
    };
  }

  /**
   * List paginated reference clauses/requirements for a framework version
   */
  async listFrameworkReferences(
    frameworkIdOrCode: string,
    options?: {
      versionId?: string;
      search?: string;
      type?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const fw = await this.getFramework(frameworkIdOrCode);

    // Identify target version
    let targetVersionId = options?.versionId;
    if (!targetVersionId && fw.versions.length > 0) {
      targetVersionId = fw.versions[0].id;
    }

    if (!targetVersionId) {
      return { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
    }

    const where: any = { frameworkVersionId: targetVersionId };

    if (options?.type && options.type !== 'ALL') {
      where.type = options.type;
    }

    if (options?.search) {
      where.OR = [
        { identifier: { contains: options.search, mode: 'insensitive' } },
        { title: { contains: options.search, mode: 'insensitive' } },
        { description: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const page = Math.max(1, Number(options?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options?.limit) || 25));
    const skip = (page - 1) * limit;

    const [references, total] = await Promise.all([
      this.dataPlanePrisma.frameworkReference.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ sortOrder: 'asc' }, { identifier: 'asc' }],
      }),
      this.dataPlanePrisma.frameworkReference.count({ where }),
    ]);

    return {
      framework: { id: fw.id, code: fw.code, name: fw.name },
      versionId: targetVersionId,
      data: references.map((r) => ({
        id: r.id,
        frameworkVersionId: r.frameworkVersionId,
        parentRefId: r.parentRefId,
        type: r.type,
        identifier: r.identifier,
        title: r.title,
        description: r.description,
        normativeText: r.normativeText,
        sortOrder: r.sortOrder,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * List organizations entitled to use this framework
   */
  async listFrameworkEntitlements(frameworkIdOrCode: string) {
    const fw = await this.getFramework(frameworkIdOrCode);

    const entitlements = await this.dataPlanePrisma.organizationFrameworkEntitlement.findMany({
      where: { frameworkId: fw.id },
      include: {
        organization: {
          select: { id: true, name: true, type: true },
        },
        frameworkVersion: {
          select: { id: true, version: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return entitlements.map((e) => ({
      id: e.id,
      organizationId: e.organizationId,
      organizationName: e.organization?.name || 'Unknown Organization',
      organizationType: e.organization?.type || 'STANDALONE',
      frameworkId: e.frameworkId,
      versionId: e.versionId,
      versionName: e.frameworkVersion?.version || 'All Versions',
      status: e.status,
      grantedAt: e.grantedAt?.toISOString() || null,
      expiresAt: e.expiresAt?.toISOString() || null,
      source: e.source,
      createdAt: e.createdAt.toISOString(),
    }));
  }
}

