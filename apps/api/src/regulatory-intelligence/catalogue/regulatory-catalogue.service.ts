import { Injectable, Logger, OnModuleInit, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { REGIONAL_GRC_COVERAGE_CATALOGUE } from './coverage-catalogue.data';
import { RegulatorySourceType, RegulatoryHealthStatus } from '@prisma/client';

@Injectable()
export class RegulatoryCatalogueService implements OnModuleInit {
  private readonly logger = new Logger(RegulatoryCatalogueService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedCatalogue();
  }

  /**
   * Idempotently seeds all multi-region coverage catalogue items and registers the initial verified RBI source.
   */
  public async seedCatalogue(): Promise<void> {
    try {
      this.logger.log('Synchronizing Multi-Region Regulatory Coverage Catalogue...');

      for (const item of REGIONAL_GRC_COVERAGE_CATALOGUE) {
        await this.prisma.regulatoryCatalogueEntry.upsert({
          where: { code: item.code },
          create: {
            code: item.code,
            displayName: item.displayName,
            jurisdiction: item.jurisdiction,
            issuingAuthority: item.issuingAuthority,
            instrumentType: item.instrumentType,
            officialSourceUrl: item.officialSourceUrl,
            verificationStatus: item.verificationStatus,
            lastVerifiedAt: item.verificationStatus === 'VERIFIED' ? new Date() : null,
            publicationMetadata: item.publicationMetadata || {},
            ingestionMethod: item.ingestionMethod,
            connectorStatus: item.connectorStatus,
            monitoringFrequency: item.monitoringFrequency,
          },
          update: {
            displayName: item.displayName,
            jurisdiction: item.jurisdiction,
            issuingAuthority: item.issuingAuthority,
            instrumentType: item.instrumentType,
            officialSourceUrl: item.officialSourceUrl,
            verificationStatus: item.verificationStatus,
            publicationMetadata: item.publicationMetadata || {},
            ingestionMethod: item.ingestionMethod,
            connectorStatus: item.connectorStatus,
            monitoringFrequency: item.monitoringFrequency,
          },
        });
      }

      // Ensure the official RBI pilot source is registered and linked to IN_RBI_CYBER_RESILIENCE
      const rbiCatalogueEntry = await this.prisma.regulatoryCatalogueEntry.findUnique({
        where: { code: 'IN_RBI_CYBER_RESILIENCE' },
      });

      if (rbiCatalogueEntry) {
        await this.prisma.regulatorySource.upsert({
          where: {
            regulatorCode_configuredEndpoint: {
              regulatorCode: 'RBI',
              configuredEndpoint: 'https://www.rbi.org.in/notifications_rss.xml',
            },
          },
          create: {
            regulatorCode: 'RBI',
            displayName: 'Reserve Bank of India — Official Notifications & Circulars Feed',
            catalogueEntryId: rbiCatalogueEntry.id,
            officialDomain: 'rbi.org.in',
            configuredEndpoint: 'https://www.rbi.org.in/notifications_rss.xml',
            sourceType: RegulatorySourceType.RSS,
            isEnabled: true,
            pollingIntervalMinutes: 1440, // 24 hours
            healthStatus: RegulatoryHealthStatus.UNTESTED,
          },
          update: {
            displayName: 'Reserve Bank of India — Official Notifications & Circulars Feed',
            catalogueEntryId: rbiCatalogueEntry.id,
            officialDomain: 'rbi.org.in',
            sourceType: RegulatorySourceType.RSS,
          },
        });
      }

      this.logger.log('Multi-Region Regulatory Coverage Catalogue synchronization complete.');
    } catch (err: any) {
      this.logger.warn(`Notice: Catalogue seeding could not complete (${err.message}). Safe to continue in non-DB mode.`);
    }
  }

  async findAll(query: {
    jurisdiction?: string;
    connectorStatus?: string;
    verificationStatus?: string;
    instrumentType?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.jurisdiction) {
      where.jurisdiction = query.jurisdiction;
    }
    if (query.connectorStatus) {
      where.connectorStatus = query.connectorStatus;
    }
    if (query.verificationStatus) {
      where.verificationStatus = query.verificationStatus;
    }
    if (query.instrumentType) {
      where.instrumentType = query.instrumentType;
    }
    if (query.search) {
      const s = query.search.trim();
      where.OR = [
        { code: { contains: s, mode: 'insensitive' } },
        { displayName: { contains: s, mode: 'insensitive' } },
        { issuingAuthority: { contains: s, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.regulatoryCatalogueEntry.findMany({
        where,
        orderBy: [{ jurisdiction: 'asc' }, { code: 'asc' }],
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              sources: true,
              publications: true,
              manualIntakes: true,
            },
          },
        },
      }),
      this.prisma.regulatoryCatalogueEntry.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findOne(idOrCode: string) {
    const entry = await this.prisma.regulatoryCatalogueEntry.findFirst({
      where: {
        OR: [{ id: idOrCode }, { code: idOrCode }],
      },
      include: {
        sources: true,
        publications: {
          take: 10,
          orderBy: { publicationDate: 'desc' },
          include: {
            versions: {
              orderBy: { versionNumber: 'desc' },
              take: 5,
            },
          },
        },
        manualIntakes: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!entry) {
      throw new NotFoundException(`Regulatory catalogue entry "${idOrCode}" not found.`);
    }

    return entry;
  }
}
