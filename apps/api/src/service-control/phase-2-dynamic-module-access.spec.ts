import { Test, TestingModule } from '@nestjs/testing';
import { EffectiveServiceStateResolver, KNOWN_CAPABILITY_CODES } from './effective-service-state-resolver.service';
import { PrismaService } from '../prisma/prisma.service';
import { LicenseVerificationService } from '../license-verification/license-verification.service';
import { ServiceCapabilityGuard } from '../common/guards/service-capability.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { Role } from '@omnigrc/shared';
import { VulnerabilitiesController } from '../vulnerabilities/vulnerabilities.controller';
import { VendorsController } from '../vendors/vendors.controller';
import { EvidenceController } from '../evidence/evidence.controller';
import { EvidenceVaultController } from '../evidence/evidence-vault.controller';
import { DocumentIntelligenceController } from '../document-intelligence/document-intelligence.controller';
import { ReportsController } from '../reports/reports.controller';
import { REQUIRE_CAPABILITY_KEY } from '../common/decorators/require-capability.decorator';

describe('Phase 2 — Dynamic Module Access Specification Suite', () => {
  let resolver: EffectiveServiceStateResolver;
  let guard: ServiceCapabilityGuard;
  let reflector: Reflector;

  const mockPrisma = {
    systemLicenseState: {
      findFirst: jest.fn(),
    },
    organizationControlStateProjection: {
      findUnique: jest.fn(),
    },
    globalServiceStateProjection: {
      findUnique: jest.fn(),
    },
    organizationServiceOverrideProjection: {
      findUnique: jest.fn(),
    },
  };

  const mockLicenseVerificationService = {
    getEvaluatedStateForOrganization: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma.organizationControlStateProjection.findUnique.mockResolvedValue({
      organizationId: 'client-org-1',
      state: 'ACTIVE',
    });
    mockPrisma.globalServiceStateProjection.findUnique.mockResolvedValue({ state: 'AVAILABLE' });
    mockPrisma.organizationServiceOverrideProjection.findUnique.mockResolvedValue(null);
    mockPrisma.systemLicenseState.findFirst.mockResolvedValue(null);
    mockLicenseVerificationService.getEvaluatedStateForOrganization.mockResolvedValue({ state: 'VALID' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EffectiveServiceStateResolver,
        ServiceCapabilityGuard,
        Reflector,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LicenseVerificationService, useValue: mockLicenseVerificationService },
      ],
    }).compile();

    resolver = module.get<EffectiveServiceStateResolver>(EffectiveServiceStateResolver);
    guard = module.get<ServiceCapabilityGuard>(ServiceCapabilityGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  describe('1. Authoritative Capability Map Exposure', () => {
    it('should expose complete dictionary of all cataloged capability codes', async () => {
      // Mock valid v2 license with specific capabilities granted
      mockPrisma.systemLicenseState.findFirst.mockResolvedValue({
        signedArtifactJson: {
          formatVersion: '2.0',
          payload: {
            licenseFormatVersion: '2.0',
            entitlements: [
              { code: 'service:GRC_CORE_ASSETS', name: 'Assets', enabled: true },
              { code: 'service:GRC_CORE_RISKS', name: 'Risks', enabled: true },
              { code: 'service:REPORTING_MODULE', name: 'Reports', enabled: true },
            ],
          },
        },
      });

      const capabilityMap = await resolver.resolveAllEffectiveStates('client-org-1');
      expect(capabilityMap).toBeDefined();

      // Check all known capability codes are keys
      for (const code of KNOWN_CAPABILITY_CODES) {
        expect(capabilityMap[code]).toBeDefined();
        expect(capabilityMap[code].capabilityCode).toBe(code);
      }

      // Granted modules should be AVAILABLE
      expect(capabilityMap['GRC_CORE_ASSETS'].isAvailable).toBe(true);
      expect(capabilityMap['GRC_CORE_RISKS'].isAvailable).toBe(true);
      expect(capabilityMap['REPORTING_MODULE'].isAvailable).toBe(true);

      // Omitted modules in v2 artifact must be COMMERCIAL_DISABLED
      expect(capabilityMap['VULNERABILITY_MGMT'].isAvailable).toBe(false);
      expect(capabilityMap['VULNERABILITY_MGMT'].effectiveState).toBe('COMMERCIAL_DISABLED');
      expect(capabilityMap['AI_CONTROL_MAPPING'].isAvailable).toBe(false);
      expect(capabilityMap['AI_CONTROL_MAPPING'].effectiveState).toBe('COMMERCIAL_DISABLED');
    });
  });

  describe('2. Isolation & Preservation of Historical Records Across Unrelated Modules', () => {
    it('should maintain access to base and unrelated entitled modules when an optional module is revoked', async () => {
      // Org has Assets, Risks, Controls, but VULNERABILITY_MGMT is explicitly revoked/disabled
      mockPrisma.systemLicenseState.findFirst.mockResolvedValue({
        signedArtifactJson: {
          formatVersion: '1.0',
          payload: {
            licenseFormatVersion: '1.0',
            entitlements: [
              { code: 'service:VULNERABILITY_MGMT', name: 'Vuln Mgmt', enabled: false },
            ],
          },
        },
      });

      const capabilityMap = await resolver.resolveAllEffectiveStates('client-org-1');

      // Revoked module is blocked
      expect(capabilityMap['VULNERABILITY_MGMT'].isAvailable).toBe(false);
      expect(capabilityMap['VULNERABILITY_MGMT'].effectiveState).toBe('COMMERCIAL_DISABLED');

      // Unrelated core modules remain completely available
      expect(capabilityMap['GRC_CORE_ASSETS'].isAvailable).toBe(true);
      expect(capabilityMap['GRC_CORE_RISKS'].isAvailable).toBe(true);
      expect(capabilityMap['GRC_CORE_CONTROLS'].isAvailable).toBe(true);
      expect(capabilityMap['POLICIES_MODULE'].isAvailable).toBe(true);
      expect(capabilityMap['EVIDENCE_VAULT'].isAvailable).toBe(true);
    });
  });

  describe('3. Multi-Org & MSSP Client Context Isolation (No Stale Entitlement Leakage)', () => {
    it('should resolve different capability maps for MSSP Provider vs Client Tenant', async () => {
      const MSSP_ORG_ID = 'mssp-provider-org';
      const CLIENT_ORG_ID = 'managed-client-org';

      // MSSP Org has full suite including MSSP_PORTAL, AI_DOC_INTELLIGENCE, and REPORTING_MODULE
      // Client Org has base package only (v2 artifact with no AI or MSSP)
      mockPrisma.systemLicenseState.findFirst.mockImplementation((args: any) => {
        const orgId = args?.where?.OR?.[0]?.organizationId;
        if (orgId === MSSP_ORG_ID) {
          return Promise.resolve({
            signedArtifactJson: {
              formatVersion: '2.0',
              payload: {
                licenseFormatVersion: '2.0',
                entitlements: [
                  { code: 'service:MSSP_PORTAL', enabled: true },
                  { code: 'service:AI_DOC_INTELLIGENCE', enabled: true },
                  { code: 'service:REPORTING_MODULE', enabled: true },
                ],
              },
            },
          });
        } else if (orgId === CLIENT_ORG_ID) {
          return Promise.resolve({
            signedArtifactJson: {
              formatVersion: '2.0',
              payload: {
                licenseFormatVersion: '2.0',
                entitlements: [
                  { code: 'service:GRC_CORE_ASSETS', enabled: true },
                  { code: 'service:GRC_CORE_RISKS', enabled: true },
                ],
              },
            },
          });
        }
        return Promise.resolve(null);
      });

      const msspCaps = await resolver.resolveAllEffectiveStates(MSSP_ORG_ID);
      const clientCaps = await resolver.resolveAllEffectiveStates(CLIENT_ORG_ID);

      // MSSP has MSSP_PORTAL and REPORTING_MODULE
      expect(msspCaps['MSSP_PORTAL'].isAvailable).toBe(true);
      expect(msspCaps['REPORTING_MODULE'].isAvailable).toBe(true);
      expect(msspCaps['AI_DOC_INTELLIGENCE'].isAvailable).toBe(true);

      // Target client org does NOT inherit MSSP entitlements
      expect(clientCaps['MSSP_PORTAL'].isAvailable).toBe(false);
      expect(clientCaps['REPORTING_MODULE'].isAvailable).toBe(false);
      expect(clientCaps['AI_DOC_INTELLIGENCE'].isAvailable).toBe(false);

      // Base modules accessible in client
      expect(clientCaps['GRC_CORE_ASSETS'].isAvailable).toBe(true);
      expect(clientCaps['GRC_CORE_RISKS'].isAvailable).toBe(true);
    });
  });

  describe('4. Backend Authorization Security Boundary (ServiceCapabilityGuard)', () => {
    function createMockContext(orgId: string, userRole: Role = Role.ADMIN): ExecutionContext {
      return {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({
            user: { organizationId: orgId, role: userRole },
            headers: {},
            params: {},
          }),
        }),
      } as any;
    }

    it('should permit request when required capability is AVAILABLE', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ capabilityCode: 'REPORTING_MODULE' });
      jest.spyOn(resolver, 'resolveEffectiveState').mockResolvedValue({
        capabilityCode: 'REPORTING_MODULE',
        effectiveState: 'AVAILABLE',
        isAvailable: true,
        reason: 'Catalog default active',
        source: 'CATALOG_DEFAULT',
      });

      const ctx = createMockContext('org-entitled');
      const canActivate = await guard.canActivate(ctx);
      expect(canActivate).toBe(true);
    });

    it('should block request with 403 CAPABILITY_DISABLED when required capability is COMMERCIAL_DISABLED', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ capabilityCode: 'REPORTING_MODULE' });
      jest.spyOn(resolver, 'resolveEffectiveState').mockResolvedValue({
        capabilityCode: 'REPORTING_MODULE',
        effectiveState: 'COMMERCIAL_DISABLED',
        isAvailable: false,
        reason: 'Service capability is explicitly excluded by commercial license',
        source: 'COMMERCIAL_LICENSE',
      });

      const ctx = createMockContext('org-unlicensed');
      try {
        await guard.canActivate(ctx);
        fail('Expected ForbiddenException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ForbiddenException);
        const res = err.getResponse();
        expect(res.code).toBe('CAPABILITY_DISABLED');
        expect(res.capability).toBe('REPORTING_MODULE');
        expect(res.state).toBe('COMMERCIAL_DISABLED');
      }
    });

    it('should throw 503 LICENSE_UNAVAILABLE when license state is unavailable or invalid', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ capabilityCode: 'REPORTING_MODULE' });
      jest.spyOn(resolver, 'resolveEffectiveState').mockResolvedValue({
        capabilityCode: 'REPORTING_MODULE',
        effectiveState: 'COMMERCIAL_DISABLED',
        isAvailable: false,
        reason: 'INVALID_OR_UNAVAILABLE: Verification provider offline',
        source: 'COMMERCIAL_LICENSE',
      });

      const ctx = createMockContext('org-err');
      try {
        await guard.canActivate(ctx);
        fail('Expected HttpException 503');
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      }
    });

    it('should permit request when all required capabilities in array are AVAILABLE', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ capabilityCode: ['GRC_CORE_ASSETS', 'GRC_CORE_RISKS'] });
      jest.spyOn(resolver, 'resolveEffectiveState').mockImplementation(async (_orgId, code) => ({
        capabilityCode: code,
        effectiveState: 'AVAILABLE',
        isAvailable: true,
        reason: 'Catalog default active',
        source: 'CATALOG_DEFAULT',
      }));

      const ctx = createMockContext('org-entitled');
      const canActivate = await guard.canActivate(ctx);
      expect(canActivate).toBe(true);
    });

    it('should block request with 403 when one of the capabilities in array is COMMERCIAL_DISABLED', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ capabilityCode: ['GRC_CORE_ASSETS', 'GRC_CORE_RISKS'] });
      jest.spyOn(resolver, 'resolveEffectiveState').mockImplementation(async (_orgId, code) => {
        if (code === 'GRC_CORE_RISKS') {
          return {
            capabilityCode: code,
            effectiveState: 'COMMERCIAL_DISABLED',
            isAvailable: false,
            reason: 'Explicitly excluded',
            source: 'COMMERCIAL_LICENSE',
          };
        }
        return {
          capabilityCode: code,
          effectiveState: 'AVAILABLE',
          isAvailable: true,
          reason: 'Catalog default active',
          source: 'CATALOG_DEFAULT',
        };
      });

      const ctx = createMockContext('org-partially-licensed');
      try {
        await guard.canActivate(ctx);
        fail('Expected ForbiddenException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ForbiddenException);
        const res = err.getResponse();
        expect(res.code).toBe('CAPABILITY_DISABLED');
        expect(res.capability).toBe('GRC_CORE_RISKS');
      }
    });
  });

  describe('5. AI Controls & Actions Capability Protection', () => {
    it('should correctly evaluate AI_CONTROL_MAPPING independently of GRC_CORE_CONTROLS', async () => {
      // Core controls enabled, but AI Control Mapping omitted/disabled
      mockPrisma.systemLicenseState.findFirst.mockResolvedValue({
        signedArtifactJson: {
          formatVersion: '2.0',
          payload: {
            licenseFormatVersion: '2.0',
            entitlements: [
              { code: 'service:GRC_CORE_CONTROLS', enabled: true },
              // AI_CONTROL_MAPPING is omitted
            ],
          },
        },
      });

      const controlsCap = await resolver.resolveEffectiveState('client-org-1', 'GRC_CORE_CONTROLS');
      const aiMappingCap = await resolver.resolveEffectiveState('client-org-1', 'AI_CONTROL_MAPPING');

      expect(controlsCap.isAvailable).toBe(true);
      expect(aiMappingCap.isAvailable).toBe(false);
      expect(aiMappingCap.effectiveState).toBe('COMMERCIAL_DISABLED');
    });

    it('should correctly evaluate AI_GRC_CHAT and AI_DOC_INTELLIGENCE independently', async () => {
      mockPrisma.systemLicenseState.findFirst.mockResolvedValue({
        signedArtifactJson: {
          formatVersion: '2.0',
          payload: {
            licenseFormatVersion: '2.0',
            entitlements: [
              { code: 'service:AI_GRC_CHAT', enabled: true },
              { code: 'service:AI_DOC_INTELLIGENCE', enabled: false },
            ],
          },
        },
      });

      const chatCap = await resolver.resolveEffectiveState('client-org-1', 'AI_GRC_CHAT');
      const docIntelCap = await resolver.resolveEffectiveState('client-org-1', 'AI_DOC_INTELLIGENCE');

      expect(chatCap.isAvailable).toBe(true);
      expect(docIntelCap.isAvailable).toBe(false);
      expect(docIntelCap.effectiveState).toBe('COMMERCIAL_DISABLED');
    });
  });

  describe('6. Finding 2: Safe Historical Access & Module Revocation Enforcement', () => {
    function createControllerContext(handler: Function, controllerClass: any, orgId = 'client-org-1'): ExecutionContext {
      return {
        getHandler: () => handler,
        getClass: () => controllerClass,
        switchToHttp: () => ({
          getRequest: () => ({
            user: { organizationId: orgId, role: Role.ADMIN },
            headers: {},
            params: {},
          }),
        }),
      } as any;
    }

    beforeEach(() => {
      // Mock resolver so all tested capability codes are revoked / disabled
      jest.spyOn(resolver, 'resolveEffectiveState').mockImplementation((orgId, capabilityCode) => {
        return Promise.resolve({
          capabilityCode,
          effectiveState: 'COMMERCIAL_DISABLED',
          isAvailable: false,
          reason: 'Module is explicitly disabled or revoked',
          source: 'COMMERCIAL_LICENSE',
        });
      });
    });

    describe('Vulnerabilities Module Revocation', () => {
      it('should permit historical reads (findAll, findOne) when VULNERABILITY_MGMT is revoked', async () => {
        const findAllCtx = createControllerContext(VulnerabilitiesController.prototype.findAll, VulnerabilitiesController);
        const findOneCtx = createControllerContext(VulnerabilitiesController.prototype.findOne, VulnerabilitiesController);

        expect(await guard.canActivate(findAllCtx)).toBe(true);
        expect(await guard.canActivate(findOneCtx)).toBe(true);
      });

      it('should block mutations (create, update, remove) when VULNERABILITY_MGMT is revoked', async () => {
        const createCtx = createControllerContext(VulnerabilitiesController.prototype.create, VulnerabilitiesController);
        const updateCtx = createControllerContext(VulnerabilitiesController.prototype.update, VulnerabilitiesController);
        const removeCtx = createControllerContext(VulnerabilitiesController.prototype.remove, VulnerabilitiesController);

        await expect(guard.canActivate(createCtx)).rejects.toThrow(ForbiddenException);
        await expect(guard.canActivate(updateCtx)).rejects.toThrow(ForbiddenException);
        await expect(guard.canActivate(removeCtx)).rejects.toThrow(ForbiddenException);
      });
    });

    describe('Vendors Module Revocation', () => {
      it('should permit historical reads (findAll, findOne) when VENDOR_RISK is revoked', async () => {
        const findAllCtx = createControllerContext(VendorsController.prototype.findAll, VendorsController);
        const findOneCtx = createControllerContext(VendorsController.prototype.findOne, VendorsController);

        expect(await guard.canActivate(findAllCtx)).toBe(true);
        expect(await guard.canActivate(findOneCtx)).toBe(true);
      });

      it('should block mutations and active operations (create, update, remove, createAssessment, migrateAssetVendors) when VENDOR_RISK is revoked', async () => {
        const createCtx = createControllerContext(VendorsController.prototype.create, VendorsController);
        const updateCtx = createControllerContext(VendorsController.prototype.update, VendorsController);
        const removeCtx = createControllerContext(VendorsController.prototype.remove, VendorsController);
        const assessCtx = createControllerContext(VendorsController.prototype.createAssessment, VendorsController);
        const migrateCtx = createControllerContext(VendorsController.prototype.migrateAssetVendors, VendorsController);

        await expect(guard.canActivate(createCtx)).rejects.toThrow(ForbiddenException);
        await expect(guard.canActivate(updateCtx)).rejects.toThrow(ForbiddenException);
        await expect(guard.canActivate(removeCtx)).rejects.toThrow(ForbiddenException);
        await expect(guard.canActivate(assessCtx)).rejects.toThrow(ForbiddenException);
        await expect(guard.canActivate(migrateCtx)).rejects.toThrow(ForbiddenException);
      });
    });

    describe('Evidence Module Revocation', () => {
      it('should permit historical reads and file downloads (vault, getEvidence, downloadEvidence) when EVIDENCE_VAULT is revoked', async () => {
        const vaultCtx = createControllerContext(EvidenceController.prototype.getVaultItems, EvidenceController);
        const getOneCtx = createControllerContext(EvidenceController.prototype.getEvidence, EvidenceController);
        const downloadCtx = createControllerContext(EvidenceController.prototype.downloadEvidence, EvidenceController);
        const vaultCtrlCtx = createControllerContext(EvidenceVaultController.prototype.getVaultItems, EvidenceVaultController);

        expect(await guard.canActivate(vaultCtx)).toBe(true);
        expect(await guard.canActivate(getOneCtx)).toBe(true);
        expect(await guard.canActivate(downloadCtx)).toBe(true);
        expect(await guard.canActivate(vaultCtrlCtx)).toBe(true);
      });

      it('should block upload and lifecycle mutations (uploadEvidence, attachEvidence, detachEvidence, archiveEvidence) when EVIDENCE_VAULT is revoked', async () => {
        const uploadCtx = createControllerContext(EvidenceController.prototype.uploadEvidence, EvidenceController);
        const attachCtx = createControllerContext(EvidenceController.prototype.attachEvidence, EvidenceController);
        const detachCtx = createControllerContext(EvidenceController.prototype.detachEvidence, EvidenceController);
        const archiveCtx = createControllerContext(EvidenceController.prototype.archiveEvidence, EvidenceController);

        await expect(guard.canActivate(uploadCtx)).rejects.toThrow(ForbiddenException);
        await expect(guard.canActivate(attachCtx)).rejects.toThrow(ForbiddenException);
        await expect(guard.canActivate(detachCtx)).rejects.toThrow(ForbiddenException);
        await expect(guard.canActivate(archiveCtx)).rejects.toThrow(ForbiddenException);
      });
    });

    describe('Document Intelligence (AI) Module Revocation', () => {
      it('should permit querying already-extracted historical findings (getEvidenceAnalyses, getAnalysisById) when AI_DOC_INTELLIGENCE is revoked', async () => {
        const analysesCtx = createControllerContext(DocumentIntelligenceController.prototype.getEvidenceAnalyses, DocumentIntelligenceController);
        const getAnalysisCtx = createControllerContext(DocumentIntelligenceController.prototype.getAnalysisById, DocumentIntelligenceController);

        expect(await guard.canActivate(analysesCtx)).toBe(true);
        expect(await guard.canActivate(getAnalysisCtx)).toBe(true);
      });

      it('should block new AI processing (analyzeEvidence, retryAnalysis) and finding conversions when AI_DOC_INTELLIGENCE is revoked', async () => {
        const analyzeCtx = createControllerContext(DocumentIntelligenceController.prototype.analyzeEvidence, DocumentIntelligenceController);
        const retryCtx = createControllerContext(DocumentIntelligenceController.prototype.retryAnalysis, DocumentIntelligenceController);
        const reviewCtx = createControllerContext(DocumentIntelligenceController.prototype.reviewFinding, DocumentIntelligenceController);
        const convertCtx = createControllerContext(DocumentIntelligenceController.prototype.convertFinding, DocumentIntelligenceController);

        await expect(guard.canActivate(analyzeCtx)).rejects.toThrow(ForbiddenException);
        await expect(guard.canActivate(retryCtx)).rejects.toThrow(ForbiddenException);
        await expect(guard.canActivate(reviewCtx)).rejects.toThrow(ForbiddenException);
        await expect(guard.canActivate(convertCtx)).rejects.toThrow(ForbiddenException);
      });
    });

    describe('Reporting Module Revocation', () => {
      it('should block live report generation and export engines when REPORTING_MODULE is revoked (policy-protected)', async () => {
        const definitionsCtx = createControllerContext(ReportsController.prototype.getReportDefinitions, ReportsController);
        const getReportCtx = createControllerContext(ReportsController.prototype.getReport, ReportsController);
        const exportCtx = createControllerContext(ReportsController.prototype.exportReport, ReportsController);

        await expect(guard.canActivate(definitionsCtx)).rejects.toThrow(ForbiddenException);
        await expect(guard.canActivate(getReportCtx)).rejects.toThrow(ForbiddenException);
        await expect(guard.canActivate(exportCtx)).rejects.toThrow(ForbiddenException);
      });
    });
  });
});
