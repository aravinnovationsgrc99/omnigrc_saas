import { Test, TestingModule } from '@nestjs/testing';
import { EvidenceService } from './evidence.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResourceAuthorizationService } from '../auth/resource-authorization.service';
import { EvidenceStorageService } from './evidence-storage.service';
import { EvidenceScannerService } from './evidence-scanner.service';
import {
  Role,
  EvidenceType,
  EvidenceStatus,
  EvidenceScanStatus,
} from '@omnigrc/shared';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('EvidenceService - Control Evidence Association Suite', () => {
  let service: EvidenceService;
  let prisma: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<any>;
  let resourceAuthService: jest.Mocked<any>;
  let storageService: jest.Mocked<any>;
  let scannerService: jest.Mocked<any>;

  const authCtx = {
    userId: 'user-1',
    organizationId: 'org-1',
    role: Role.ADMIN,
  };

  beforeEach(async () => {
    prisma = {
      control: {
        findFirst: jest.fn(),
      },
      controlEvidence: {
        findMany: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      evidence: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1', name: 'User 1', email: 'user1@example.com' }),
      },
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({}),
    };

    resourceAuthService = {
      getScopeWhereClause: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
      authorize: jest.fn().mockResolvedValue(undefined),
    };

    storageService = {
      saveFile: jest.fn(),
      getFileStream: jest.fn(),
    };

    scannerService = {
      scanFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvidenceService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: ResourceAuthorizationService, useValue: resourceAuthService },
        { provide: EvidenceStorageService, useValue: storageService },
        { provide: EvidenceScannerService, useValue: scannerService },
      ],
    }).compile();

    service = module.get<EvidenceService>(EvidenceService);
  });

  describe('getEvidenceForControl', () => {
    it('throws NotFoundException if control does not exist or is out of tenant scope', async () => {
      prisma.control.findFirst.mockResolvedValue(null);

      await expect(
        service.getEvidenceForControl(authCtx, 'ctrl-missing'),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.control.findFirst).toHaveBeenCalledWith({
        where: { id: 'ctrl-missing', organizationId: 'org-1', deletedAt: null },
      });
    });

    it('returns associated evidence with computed isValidComplianceEvidence flags and resolved uploader names', async () => {
      prisma.control.findFirst.mockResolvedValue({ id: 'ctrl-1', organizationId: 'org-1' });

      const mockJoins = [
        {
          id: 'ce-1',
          controlId: 'ctrl-1',
          evidenceId: 'ev-clean',
          attachedAt: new Date('2026-10-01T10:00:00Z'),
          evidence: {
            id: 'ev-clean',
            title: 'Clean SOC 2 Report',
            description: 'Q3 audit report',
            evidenceType: EvidenceType.DOCUMENT,
            fileName: 'soc2.pdf',
            fileSize: 1024,
            mimeType: 'application/pdf',
            status: EvidenceStatus.ACTIVE,
            scanStatus: EvidenceScanStatus.CLEAN,
            checksum: 'sha256-clean',
            uploadedById: 'user-uploader',
            deletedAt: null,
          },
        },
        {
          id: 'ce-2',
          controlId: 'ctrl-1',
          evidenceId: 'ev-quarantined',
          attachedAt: new Date('2026-10-02T10:00:00Z'),
          evidence: {
            id: 'ev-quarantined',
            title: 'Infected Script',
            description: 'Suspicious upload',
            evidenceType: EvidenceType.CONFIG_EXPORT,
            fileName: 'infected.sh',
            fileSize: 512,
            mimeType: 'text/x-shellscript',
            status: EvidenceStatus.QUARANTINED,
            scanStatus: EvidenceScanStatus.QUARANTINED,
            checksum: 'sha256-bad',
            uploadedById: 'user-uploader',
            deletedAt: null,
          },
        },
      ];

      prisma.controlEvidence.findMany.mockResolvedValue(mockJoins);
      prisma.user.findMany.mockResolvedValue([
        { id: 'user-uploader', name: 'Alice Security', email: 'alice@example.com' },
      ]);

      const result = await service.getEvidenceForControl(authCtx, 'ctrl-1');

      expect(result.items.length).toBe(2);
      expect(result.total).toBe(2);

      // Clean item
      const cleanItem = result.items.find((i) => i.evidenceId === 'ev-clean');
      expect(cleanItem).toBeDefined();
      expect(cleanItem?.isValidComplianceEvidence).toBe(true);
      expect(cleanItem?.uploaderName).toBe('Alice Security');

      // Quarantined item
      const quarantinedItem = result.items.find((i) => i.evidenceId === 'ev-quarantined');
      expect(quarantinedItem).toBeDefined();
      expect(quarantinedItem?.isValidComplianceEvidence).toBe(false);
      expect(quarantinedItem?.status).toBe(EvidenceStatus.QUARANTINED);
      expect(quarantinedItem?.scanStatus).toBe(EvidenceScanStatus.QUARANTINED);
    });

    it('respects search filtering across title, fileName, and description', async () => {
      prisma.control.findFirst.mockResolvedValue({ id: 'ctrl-1', organizationId: 'org-1' });

      prisma.controlEvidence.findMany.mockResolvedValue([
        {
          id: 'ce-1',
          controlId: 'ctrl-1',
          evidenceId: 'ev-1',
          attachedAt: new Date(),
          evidence: {
            id: 'ev-1',
            title: 'Firewall Config',
            fileName: 'fw.json',
            description: 'Network edge configuration',
            evidenceType: EvidenceType.CONFIG_EXPORT,
            fileSize: 100,
            mimeType: 'application/json',
            status: EvidenceStatus.ACTIVE,
            scanStatus: EvidenceScanStatus.CLEAN,
            uploadedById: 'user-1',
          },
        },
        {
          id: 'ce-2',
          controlId: 'ctrl-1',
          evidenceId: 'ev-2',
          attachedAt: new Date(),
          evidence: {
            id: 'ev-2',
            title: 'Employee Training List',
            fileName: 'training.csv',
            description: 'Annual training attendance',
            evidenceType: EvidenceType.SPREADSHEET,
            fileSize: 200,
            mimeType: 'text/csv',
            status: EvidenceStatus.ACTIVE,
            scanStatus: EvidenceScanStatus.CLEAN,
            uploadedById: 'user-1',
          },
        },
      ]);
      prisma.user.findMany.mockResolvedValue([]);

      const result = await service.getEvidenceForControl(authCtx, 'ctrl-1', { search: 'firewall' });
      expect(result.items.length).toBe(1);
      expect(result.items[0].evidenceId).toBe('ev-1');
    });
  });

  describe('attachEvidence & detachEvidence', () => {
    it('attachEvidence rejects cross-tenant control attachment with NotFoundException', async () => {
      prisma.evidence.findFirst.mockResolvedValue({ id: 'ev-1', organizationId: 'org-1' });
      // Control lookup fails because target control belongs to another org
      prisma.control.findFirst.mockResolvedValue(null);

      await expect(
        service.attachEvidence(authCtx, 'ev-1', 'CONTROL', 'ctrl-cross-tenant'),
      ).rejects.toThrow(NotFoundException);
    });

    it('detachEvidence removes only the ControlEvidence join record, preserving evidence entity', async () => {
      prisma.evidence.findFirst.mockResolvedValue({ id: 'ev-1', organizationId: 'org-1' });
      prisma.control.findFirst.mockResolvedValue({ id: 'ctrl-1', organizationId: 'org-1' });
      prisma.controlEvidence.deleteMany.mockResolvedValue({ count: 1 });
      prisma.evidence.findUnique.mockResolvedValue({
        id: 'ev-1',
        organizationId: 'org-1',
        title: 'Evidence Still Intact',
        evidenceType: EvidenceType.DOCUMENT,
        fileName: 'test.pdf',
        fileSize: 100,
        mimeType: 'application/pdf',
        storageKey: 'key-1',
        checksum: 'sha-1',
        status: EvidenceStatus.ACTIVE,
        scanStatus: EvidenceScanStatus.CLEAN,
        uploadedById: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        controlAssociations: [],
        riskAssociations: [],
        policyAssociations: [],
        auditCheckAssociations: [],
        auditFindingAssociations: [],
        vendorAssociations: [],
        vulnerabilityAssociations: [],
        incidentAssociations: [],
        frameworkReferences: [],
      });

      const res = await service.detachEvidence(authCtx, 'ev-1', 'CONTROL', 'ctrl-1');

      expect(prisma.controlEvidence.deleteMany).toHaveBeenCalledWith({
        where: { evidenceId: 'ev-1', controlId: 'ctrl-1' },
      });
      // Verifies evidence was NOT deleted or soft-deleted
      expect(prisma.evidence.update).not.toHaveBeenCalled();
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EVIDENCE_DETACHED',
          metadata: { resourceType: 'CONTROL', resourceId: 'ctrl-1' },
        }),
      );
      expect(res.id).toBe('ev-1');
    });

    it('downloadEvidence rejects quarantined evidence with ForbiddenException', async () => {
      prisma.evidence.findFirst.mockResolvedValue({
        id: 'ev-malware',
        title: 'Trojan Proof',
        status: EvidenceStatus.QUARANTINED,
        scanStatus: EvidenceScanStatus.QUARANTINED,
      });

      const mockRes: any = {};
      await expect(
        service.downloadEvidence(authCtx, 'ev-malware', mockRes),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll (Vault & Scope Filtering)', () => {
    it('applies frameworkReferenceId at the database level with proper pagination', async () => {
      prisma.evidence.findMany.mockResolvedValue([
        {
          id: 'ev-scoped-1',
          organizationId: 'org-1',
          title: 'Access Control Policy Screenshot',
          description: 'Proof for AC-1',
          evidenceType: EvidenceType.IMAGE,
          fileName: 'proof.png',
          fileSize: 1024,
          mimeType: 'image/png',
          storageKey: 'key-1',
          checksum: 'sha-scoped-1',
          status: EvidenceStatus.ACTIVE,
          scanStatus: EvidenceScanStatus.CLEAN,
          uploadedById: 'user-1',
          retentionUntil: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          controlAssociations: [],
          riskAssociations: [],
          policyAssociations: [],
          auditCheckAssociations: [],
          auditFindingAssociations: [],
          vendorAssociations: [],
          vulnerabilityAssociations: [],
          incidentAssociations: [],
          frameworkReferences: [
            {
              frameworkReference: {
                id: 'ref-iso-1',
                identifier: 'A.9.1.1',
                title: 'Access control policy',
                frameworkVersion: {
                  framework: { code: 'ISO27001', name: 'ISO/IEC 27001' },
                },
              },
            },
          ],
        },
      ]);
      prisma.evidence.count.mockResolvedValue(1);

      const result = await service.findAll(authCtx, {
        page: 2,
        limit: 10,
        frameworkReferenceId: 'ref-iso-1',
      });

      expect(prisma.evidence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
          where: expect.objectContaining({
            organizationId: 'org-1',
            deletedAt: null,
            frameworkReferences: {
              some: { frameworkReferenceId: 'ref-iso-1' },
            },
          }),
        }),
      );
      expect(prisma.evidence.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            frameworkReferences: {
              some: { frameworkReferenceId: 'ref-iso-1' },
            },
          }),
        }),
      );
      expect(result.items.length).toBe(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(2);
      expect(result.items[0].frameworkReferences?.[0].identifier).toBe('A.9.1.1');
      expect(result.items[0].frameworkReferences?.[0].frameworkCode).toBe('ISO27001');
    });

    it('applies frameworkId filter via nested frameworkVersion relationship at database level', async () => {
      prisma.evidence.findMany.mockResolvedValue([]);
      prisma.evidence.count.mockResolvedValue(0);

      await service.findAll(authCtx, {
        frameworkId: 'fw-soc2',
      });

      expect(prisma.evidence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            frameworkReferences: {
              some: {
                frameworkReference: {
                  frameworkVersion: { frameworkId: 'fw-soc2' },
                },
              },
            },
          }),
        }),
      );
    });

    it('enforces multi-tenant isolation from ResourceAuthorizationService', async () => {
      resourceAuthService.getScopeWhereClause.mockResolvedValue({
        organizationId: 'org-custom-tenant',
      });
      prisma.evidence.findMany.mockResolvedValue([]);
      prisma.evidence.count.mockResolvedValue(0);

      await service.findAll({ userId: 'u-x', organizationId: 'org-custom-tenant', role: Role.ADMIN }, {});

      expect(prisma.evidence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-custom-tenant',
          }),
        }),
      );
    });
  });
});
