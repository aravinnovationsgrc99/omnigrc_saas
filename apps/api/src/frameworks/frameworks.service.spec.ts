import { Test, TestingModule } from '@nestjs/testing';
import { FrameworksService } from './frameworks.service';
import { PrismaService } from '../prisma/prisma.service';
import { FrameworkEntitlementsService } from './framework-entitlements.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { FrameworkCode } from '@omnigrc/shared';

describe('FrameworksService', () => {
  let service: FrameworksService;
  let prisma: any;
  let entitlementsService: any;

  const mockPrisma = {
    framework: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    frameworkVersion: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    frameworkReference: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const mockEntitlementsService = {
    getEntitledFrameworkIds: jest.fn(),
    assertEntitled: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FrameworksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FrameworkEntitlementsService, useValue: mockEntitlementsService },
      ],
    }).compile();

    service = module.get<FrameworksService>(FrameworksService);
    prisma = module.get(PrismaService);
    entitlementsService = module.get(FrameworkEntitlementsService);

    jest.clearAllMocks();
  });

  describe('getReference', () => {
    it('should throw NotFoundException if reference does not exist', async () => {
      prisma.frameworkReference.findUnique.mockResolvedValue(null);

      await expect(service.getReference('org-1', 'ref-non-existent')).rejects.toThrow(
        NotFoundException,
      );
      expect(entitlementsService.assertEntitled).not.toHaveBeenCalled();
    });

    it('should resolve authoritative frameworkVersionId and pass it to assertEntitled', async () => {
      const mockRef = {
        id: 'ref-a51-2013',
        frameworkVersionId: 'ver-iso-2013',
        identifier: 'A.5.1',
        title: 'Management direction for information security',
        description: 'Policies for information security',
        normativeText: null,
        sortOrder: 1,
        frameworkVersion: {
          id: 'ver-iso-2013',
          frameworkId: 'fw-iso27001',
          version: '2013',
          name: 'ISO/IEC 27001:2013',
        },
      };

      prisma.frameworkReference.findUnique.mockResolvedValue(mockRef);
      entitlementsService.assertEntitled.mockResolvedValue(undefined);

      const result = await service.getReference('org-1', 'ref-a51-2013');

      expect(prisma.frameworkReference.findUnique).toHaveBeenCalledWith({
        where: { id: 'ref-a51-2013' },
        include: {
          frameworkVersion: {
            select: { id: true, frameworkId: true, version: true, name: true },
          },
        },
      });

      // Verify assertEntitled is called with authoritative versionId from database relation
      expect(entitlementsService.assertEntitled).toHaveBeenCalledWith(
        'org-1',
        'fw-iso27001',
        'ver-iso-2013',
      );

      expect(result).toEqual({
        id: 'ref-a51-2013',
        frameworkVersionId: 'ver-iso-2013',
        frameworkId: 'fw-iso27001',
        version: '2013',
        versionName: 'ISO/IEC 27001:2013',
        identifier: 'A.5.1',
        title: 'Management direction for information security',
        description: 'Policies for information security',
        normativeText: null,
        sortOrder: 1,
      });
    });

    it('should propagate ForbiddenException when organization is not entitled to the reference version', async () => {
      const mockRef = {
        id: 'ref-a51-2013',
        frameworkVersionId: 'ver-iso-2013',
        identifier: 'A.5.1',
        title: 'Policies for information security',
        frameworkVersion: {
          id: 'ver-iso-2013',
          frameworkId: 'fw-iso27001',
          version: '2013',
          name: 'ISO/IEC 27001:2013',
        },
      };

      prisma.frameworkReference.findUnique.mockResolvedValue(mockRef);
      entitlementsService.assertEntitled.mockRejectedValue(
        new ForbiddenException('Organization is not commercially entitled to access this framework version.'),
      );

      await expect(service.getReference('org-1', 'ref-a51-2013')).rejects.toThrow(
        ForbiddenException,
      );

      expect(entitlementsService.assertEntitled).toHaveBeenCalledWith(
        'org-1',
        'fw-iso27001',
        'ver-iso-2013',
      );
    });
  });

  describe('getVersionClauses', () => {
    it('should retrieve version clauses when version belongs to framework and org is entitled', async () => {
      const fwId = 'fw-1';
      const verId = 'ver-1';
      const orgId = 'org-1';

      prisma.framework.findFirst.mockResolvedValue({ id: fwId, code: FrameworkCode.ISO27001 });
      prisma.frameworkVersion.findUnique.mockResolvedValue({ id: verId, frameworkId: fwId, version: '2022' });
      prisma.frameworkReference.findMany.mockResolvedValue([
        {
          id: 'ref-1',
          frameworkVersionId: verId,
          parentRefId: null,
          type: 'CONTROL',
          identifier: 'A.5.1',
          title: 'Policies for information security',
          description: 'Policies description',
          normativeText: null,
          sortOrder: 1,
          provenance: null,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ]);
      entitlementsService.assertEntitled.mockResolvedValue(undefined);

      const result = await service.getVersionClauses(orgId, fwId, verId);

      expect(entitlementsService.assertEntitled).toHaveBeenCalledWith(orgId, fwId);
      expect(entitlementsService.assertEntitled).toHaveBeenCalledWith(orgId, fwId, verId);
      expect(result).toHaveLength(1);
      expect(result[0].identifier).toBe('A.5.1');
      expect(result[0].title).toBe('Policies for information security');
    });

    it('should throw BadRequestException if version belongs to a different framework', async () => {
      const fwId = 'fw-1';
      const verId = 'ver-wrong';
      const orgId = 'org-1';

      prisma.framework.findFirst.mockResolvedValue({ id: fwId, code: FrameworkCode.ISO27001 });
      prisma.frameworkVersion.findUnique.mockResolvedValue({ id: verId, frameworkId: 'fw-other', version: '2023' });
      entitlementsService.assertEntitled.mockResolvedValue(undefined);

      await expect(service.getVersionClauses(orgId, fwId, verId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if framework not found', async () => {
      prisma.framework.findFirst.mockResolvedValue(null);
      entitlementsService.assertEntitled.mockResolvedValue(undefined);

      await expect(service.getVersionClauses('org-1', 'nonexistent', 'ver-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should support search and type filters in query', async () => {
      const fwId = 'fw-1';
      const verId = 'ver-1';
      const orgId = 'org-1';

      prisma.framework.findFirst.mockResolvedValue({ id: fwId, code: FrameworkCode.ISO27001 });
      prisma.frameworkVersion.findUnique.mockResolvedValue({ id: verId, frameworkId: fwId, version: '2022' });
      prisma.frameworkReference.findMany.mockResolvedValue([]);
      entitlementsService.assertEntitled.mockResolvedValue(undefined);

      await service.getVersionClauses(orgId, fwId, verId, { search: 'Access', type: 'CONTROL' });

      expect(prisma.frameworkReference.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            frameworkVersionId: verId,
            type: 'CONTROL',
            OR: expect.any(Array),
          }),
        }),
      );
    });
  });
});
