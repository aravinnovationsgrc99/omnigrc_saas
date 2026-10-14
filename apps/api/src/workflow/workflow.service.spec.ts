import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { PrismaService } from '../prisma/prisma.service';
import { FrameworkEntitlementsService } from '../frameworks/framework-entitlements.service';
import { RemediationService } from '../remediation/remediation.service';
import { EffectiveServiceStateResolver } from '../service-control/effective-service-state-resolver.service';
import { Role, AuditCheckResult, FindingStatus, EvidenceScanStatus, ApprovalInstanceStatus } from '@omnigrc/shared';

describe('WorkflowService - Capability and Authorization Enforcement', () => {
  let service: WorkflowService;
  let prisma: jest.Mocked<any>;
  let effectiveResolver: jest.Mocked<any>;
  let frameworkEntitlementsService: jest.Mocked<any>;
  let remediationService: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      control: { findFirst: jest.fn() },
      risk: { findFirst: jest.fn() },
      policy: { findFirst: jest.fn() },
      auditFinding: { findFirst: jest.fn() },
      vendorAssessment: { findFirst: jest.fn() },
      vulnerability: { findFirst: jest.fn() },
      incident: { findFirst: jest.fn() },
      frameworkReference: { findFirst: jest.fn() },
      controlEvidence: { findMany: jest.fn().mockResolvedValue([]) },
      riskEvidence: { findMany: jest.fn().mockResolvedValue([]) },
      policyEvidence: { findMany: jest.fn().mockResolvedValue([]) },
      auditFindingEvidence: { findMany: jest.fn().mockResolvedValue([]) },
      vendorEvidence: { findMany: jest.fn().mockResolvedValue([]) },
      vulnerabilityEvidence: { findMany: jest.fn().mockResolvedValue([]) },
      incidentEvidence: { findMany: jest.fn().mockResolvedValue([]) },
      documentAnalysis: { findMany: jest.fn().mockResolvedValue([]) },
      approvalInstance: { findMany: jest.fn().mockResolvedValue([]) },
      extractedFinding: { findMany: jest.fn().mockResolvedValue([]) },
      evidence: { findMany: jest.fn().mockResolvedValue([]) },
      auditCheckItem: { findMany: jest.fn().mockResolvedValue([]) },
    };

    effectiveResolver = {
      resolveEffectiveState: jest.fn().mockImplementation(async (orgId, capabilityCode) => ({
        capabilityCode,
        effectiveState: 'AVAILABLE',
        isAvailable: true,
        reason: 'Active capability',
        source: 'CATALOG_DEFAULT',
      })),
    };

    frameworkEntitlementsService = {
      isEntitled: jest.fn().mockResolvedValue(true),
    };

    remediationService = {
      findAll: jest.fn().mockResolvedValue({ total: 0, items: [] }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowService,
        { provide: PrismaService, useValue: prisma },
        { provide: FrameworkEntitlementsService, useValue: frameworkEntitlementsService },
        { provide: RemediationService, useValue: remediationService },
        { provide: EffectiveServiceStateResolver, useValue: effectiveResolver },
      ],
    }).compile();

    service = moduleRef.get<WorkflowService>(WorkflowService);
  });

  describe('Primary Domain Capability & Unknown Domain Enforcement', () => {
    it('should reject getLifecycle for unknown workflow domain with ForbiddenException (fail closed)', async () => {
      await expect(service.getLifecycle('org-1', 'UNKNOWN_DOMAIN', '123')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should reject getLifecycle if primary domain capability is disabled', async () => {
      effectiveResolver.resolveEffectiveState.mockImplementation(async (orgId, code) => {
        if (code === 'GRC_CORE_CONTROLS') {
          return { capabilityCode: code, effectiveState: 'DISABLED', isAvailable: false, reason: 'Disabled', source: 'ORGANIZATION_SERVICE_OVERRIDE' };
        }
        return { capabilityCode: code, effectiveState: 'AVAILABLE', isAvailable: true, reason: 'Active', source: 'CATALOG_DEFAULT' };
      });

      prisma.control.findFirst.mockResolvedValue({ id: 'c-1', name: 'Control 1', mappings: [] });

      await expect(service.getLifecycle('org-1', 'CONTROL', 'c-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow getLifecycle when primary domain capability is enabled', async () => {
      prisma.control.findFirst.mockResolvedValue({
        id: 'c-1',
        name: 'Control 1',
        mappings: [],
      });

      const res = await service.getLifecycle('org-1', 'CONTROL', 'c-1');
      expect(res.resourceId).toBe('c-1');
      expect(res.resourceTitle).toBe('Control 1');
    });

    it('should enforce domain mappings for all 7 supported primary domains', async () => {
      // 1. RISK
      prisma.risk.findFirst.mockResolvedValue({ id: 'r-1', title: 'Risk 1', status: 'OPEN' });
      const resRisk = await service.getLifecycle('org-1', 'RISK', 'r-1');
      expect(resRisk.resourceType).toBe('RISK');

      // 2. POLICY
      prisma.policy.findFirst.mockResolvedValue({ id: 'p-1', title: 'Policy 1', status: 'DRAFT' });
      const resPolicy = await service.getLifecycle('org-1', 'POLICY', 'p-1');
      expect(resPolicy.resourceType).toBe('POLICY');

      // 3. AUDIT_FINDING
      prisma.auditFinding.findFirst.mockResolvedValue({ id: 'f-1', title: 'Finding 1', status: 'OPEN' });
      const resFinding = await service.getLifecycle('org-1', 'AUDIT_FINDING', 'f-1');
      expect(resFinding.resourceType).toBe('AUDIT_FINDING');

      // 4. VENDOR_ASSESSMENT
      prisma.vendorAssessment.findFirst.mockResolvedValue({ id: 'va-1', title: 'Vendor Assessment 1', status: 'SUBMITTED' });
      const resVendor = await service.getLifecycle('org-1', 'VENDOR_ASSESSMENT', 'va-1');
      expect(resVendor.resourceType).toBe('VENDOR_ASSESSMENT');

      // 5. VULNERABILITY
      prisma.vulnerability.findFirst.mockResolvedValue({ id: 'v-1', title: 'Vuln 1', status: 'OPEN' });
      const resVuln = await service.getLifecycle('org-1', 'VULNERABILITY', 'v-1');
      expect(resVuln.resourceType).toBe('VULNERABILITY');

      // 6. INCIDENT
      prisma.incident.findFirst.mockResolvedValue({ id: 'inc-1', title: 'Incident 1', status: 'INVESTIGATING' });
      const resInc = await service.getLifecycle('org-1', 'INCIDENT', 'inc-1');
      expect(resInc.resourceType).toBe('INCIDENT');
    });
  });

  describe('Mixed-Domain Sub-Resource Capability Handling', () => {
    it('should omit sub-domain data when sub-domain capability is disabled without blocking overall lifecycle endpoint', async () => {
      prisma.control.findFirst.mockResolvedValue({
        id: 'c-1',
        name: 'Control 1',
        mappings: [],
      });

      // Disable APPROVAL_ENGINE and AI_DOC_INTELLIGENCE
      effectiveResolver.resolveEffectiveState.mockImplementation(async (orgId, code) => {
        if (code === 'APPROVAL_ENGINE' || code === 'AI_DOC_INTELLIGENCE') {
          return { capabilityCode: code, effectiveState: 'DISABLED', isAvailable: false, reason: 'Disabled', source: 'GLOBAL_SERVICE_STATE' };
        }
        return { capabilityCode: code, effectiveState: 'AVAILABLE', isAvailable: true, reason: 'Active', source: 'CATALOG_DEFAULT' };
      });

      const res = await service.getLifecycle('org-1', 'CONTROL', 'c-1');
      expect(res.resourceId).toBe('c-1');
      expect(res.approvals).toEqual([]);
      expect(res.aiAnalyses).toEqual([]);
      expect(prisma.approvalInstance.findMany).not.toHaveBeenCalled();
    });

    it('should filter disabled domains from getAttentionSummary without crashing', async () => {
      // Disable APPROVAL_ENGINE and EVIDENCE_VAULT
      effectiveResolver.resolveEffectiveState.mockImplementation(async (orgId, code) => {
        if (code === 'APPROVAL_ENGINE' || code === 'EVIDENCE_VAULT') {
          return { capabilityCode: code, effectiveState: 'DISABLED', isAvailable: false, reason: 'Disabled', source: 'COMMERCIAL_LICENSE' };
        }
        return { capabilityCode: code, effectiveState: 'AVAILABLE', isAvailable: true, reason: 'Active', source: 'CATALOG_DEFAULT' };
      });

      remediationService.findAll.mockResolvedValueOnce({
        total: 1,
        items: [{ id: 'rem-1', title: 'Overdue Rem 1', sourceType: 'CONTROL', sourceId: 'c-1', priorityOrSeverity: 'HIGH', dueDate: '2026-10-01' }],
      });

      const summary = await service.getAttentionSummary('org-1', 'usr-1', Role.ADMIN);
      expect(summary.pendingApprovalsCount).toBe(0);
      expect(summary.overdueRemediationsCount).toBe(1);
      expect(summary.items).toHaveLength(1);
      expect(summary.items[0].id).toBe('rem-rem-1');

      expect(prisma.approvalInstance.findMany).not.toHaveBeenCalled();
      expect(prisma.evidence.findMany).not.toHaveBeenCalled();
    });
  });

  describe('Tenant Isolation & Cross-Tenant Access', () => {
    it('should throw NotFoundException if resource does not belong to requesting tenant', async () => {
      prisma.control.findFirst.mockResolvedValue(null);

      await expect(service.getLifecycle('org-tenant-b', 'CONTROL', 'c-tenant-a')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('Phase 3 Increment 4.2 — Control Testing Workflow Lifecycle Integration', () => {
    beforeEach(() => {
      prisma.control.findFirst.mockResolvedValue({
        id: 'ctrl-100',
        name: 'Access Enforcement Control',
        mappings: [],
      });
    });

    it('should return PENDING for CONTROL_TESTING stage when control has no audit test history', async () => {
      prisma.auditCheckItem.findMany.mockResolvedValueOnce([]);

      const lifecycle = await service.getControlLifecycle('org-1', 'ctrl-100');
      expect(lifecycle.resourceId).toBe('ctrl-100');
      expect(lifecycle.isBlocked).toBe(false);

      const testStage = lifecycle.stages.find((s) => s.stage === 'CONTROL_TESTING');
      expect(testStage).toBeDefined();
      expect(testStage?.status).toBe('PENDING');
      expect(testStage?.label).toContain('Untested Control');
      expect(lifecycle.testing?.effectivenessStatus).toBe('NOT_TESTED');
      expect(lifecycle.testing?.totalTests).toBe(0);
    });

    it('should return COMPLETED and EFFECTIVE when latest evaluated test is COMPLIANT', async () => {
      prisma.auditCheckItem.findMany.mockResolvedValueOnce([
        {
          id: 'ci-1',
          controlId: 'ctrl-100',
          result: AuditCheckResult.COMPLIANT,
          updatedAt: new Date(),
          findings: [],
        },
      ]);

      const lifecycle = await service.getControlLifecycle('org-1', 'ctrl-100');
      expect(lifecycle.isBlocked).toBe(false);

      const testStage = lifecycle.stages.find((s) => s.stage === 'CONTROL_TESTING');
      expect(testStage?.status).toBe('COMPLETED');
      expect(testStage?.label).toContain('Control Test Effective (COMPLIANT)');
      expect(lifecycle.testing?.effectivenessStatus).toBe('EFFECTIVE');
      expect(lifecycle.testing?.latestResult).toBe(AuditCheckResult.COMPLIANT);
    });

    it('should return BLOCKED and block overall authoritative state when latest evaluated test is NON_COMPLIANT', async () => {
      prisma.auditCheckItem.findMany.mockResolvedValueOnce([
        {
          id: 'ci-fail-1',
          controlId: 'ctrl-100',
          result: AuditCheckResult.NON_COMPLIANT,
          updatedAt: new Date(),
          findings: [],
        },
      ]);

      const lifecycle = await service.getControlLifecycle('org-1', 'ctrl-100');
      expect(lifecycle.isBlocked).toBe(true);
      expect(lifecycle.blockedReason).toContain('NON_COMPLIANT');

      const testStage = lifecycle.stages.find((s) => s.stage === 'CONTROL_TESTING');
      expect(testStage?.status).toBe('BLOCKED');
      expect(testStage?.blockerReason).toContain('non-compliant');

      const authStage = lifecycle.stages.find((s) => s.stage === 'AUTHORITATIVE_STATE');
      expect(authStage?.status).toBe('BLOCKED');
      expect(lifecycle.testing?.effectivenessStatus).toBe('INEFFECTIVE');
    });

    it('should return WARNING and PARTIALLY_EFFECTIVE when latest evaluated test is PARTIALLY_COMPLIANT', async () => {
      prisma.auditCheckItem.findMany.mockResolvedValueOnce([
        {
          id: 'ci-partial-1',
          controlId: 'ctrl-100',
          result: AuditCheckResult.PARTIALLY_COMPLIANT,
          updatedAt: new Date(),
          findings: [],
        },
      ]);

      const lifecycle = await service.getControlLifecycle('org-1', 'ctrl-100');
      const testStage = lifecycle.stages.find((s) => s.stage === 'CONTROL_TESTING');
      expect(testStage?.status).toBe('WARNING');
      expect(testStage?.label).toContain('Partially Compliant');
      expect(lifecycle.testing?.effectivenessStatus).toBe('PARTIALLY_EFFECTIVE');
    });

    it('should return WARNING when control test has open unresolved findings', async () => {
      prisma.auditCheckItem.findMany.mockResolvedValueOnce([
        {
          id: 'ci-with-findings',
          controlId: 'ctrl-100',
          result: AuditCheckResult.COMPLIANT,
          updatedAt: new Date(),
          findings: [
            { id: 'f-1', status: FindingStatus.OPEN, severity: 'HIGH' },
          ],
        },
      ]);

      const lifecycle = await service.getControlLifecycle('org-1', 'ctrl-100');
      const testStage = lifecycle.stages.find((s) => s.stage === 'CONTROL_TESTING');
      expect(testStage?.status).toBe('WARNING');
      expect(testStage?.label).toContain('Deficiencies Found');
      expect(lifecycle.testing?.unresolvedFindingsCount).toBe(1);
    });

    it('should preserve existing evidence quarantine and approval blockers alongside control testing', async () => {
      prisma.auditCheckItem.findMany.mockResolvedValueOnce([
        {
          id: 'ci-pass',
          controlId: 'ctrl-100',
          result: AuditCheckResult.COMPLIANT,
          updatedAt: new Date(),
          findings: [],
        },
      ]);

      // Attach quarantined evidence
      prisma.controlEvidence.findMany.mockResolvedValueOnce([
        {
          evidence: {
            id: 'ev-quarantine',
            title: 'Infected Evidence',
            fileName: 'malware.exe',
            scanStatus: EvidenceScanStatus.QUARANTINED,
            status: 'ACTIVE',
          },
        },
      ]);

      const lifecycle = await service.getControlLifecycle('org-1', 'ctrl-100');
      expect(lifecycle.isBlocked).toBe(true);
      expect(lifecycle.blockedReason).toContain('Quarantined or unverified evidence');
    });

    it('should return NOT_APPLICABLE for CONTROL_TESTING without crashing when BUSINESS_AUDITS capability is disabled', async () => {
      effectiveResolver.resolveEffectiveState.mockImplementation(async (orgId, code) => {
        if (code === 'BUSINESS_AUDITS') {
          return { capabilityCode: code, effectiveState: 'DISABLED', isAvailable: false, reason: 'Disabled', source: 'COMMERCIAL_LICENSE' };
        }
        return { capabilityCode: code, effectiveState: 'AVAILABLE', isAvailable: true, reason: 'Active', source: 'CATALOG_DEFAULT' };
      });

      const lifecycle = await service.getControlLifecycle('org-1', 'ctrl-100');
      const testStage = lifecycle.stages.find((s) => s.stage === 'CONTROL_TESTING');
      expect(testStage?.status).toBe('NOT_APPLICABLE');
      expect(lifecycle.testing?.isAvailable).toBe(false);
      expect(lifecycle.isBlocked).toBe(false);
    });

    it('should return identical results from getControlLifecycle and getLifecycle for CONTROL', async () => {
      prisma.auditCheckItem.findMany.mockResolvedValue([
        {
          id: 'ci-1',
          controlId: 'ctrl-100',
          result: AuditCheckResult.COMPLIANT,
          updatedAt: new Date(),
          findings: [],
        },
      ]);

      const directResult = await service.getControlLifecycle('org-1', 'ctrl-100');
      const unifiedResult = await service.getLifecycle('org-1', 'CONTROL', 'ctrl-100');
      expect(directResult).toEqual(unifiedResult);
    });
  });

  describe('Phase 4 — Workflow Clarity: Authoritative Next Actions & Prerequisites Synthesis', () => {
    it('should identify quarantined evidence as CRITICAL blocker next action', async () => {
      prisma.control.findFirst.mockResolvedValue({
        id: 'c-quarantine',
        name: 'Firewall Policy Control',
        mappings: [{ id: 'm-1', frameworkReferenceId: 'ref-1', status: 'APPROVED' }],
      });

      prisma.controlEvidence.findMany.mockResolvedValue([
        {
          evidence: {
            id: 'ev-bad',
            title: 'Infected Packet Dump',
            fileName: 'dump.pcap',
            scanStatus: EvidenceScanStatus.QUARANTINED,
            status: 'ACTIVE',
          },
        },
      ]);

      const lifecycle = await service.getLifecycle('org-1', 'CONTROL', 'c-quarantine');

      expect(lifecycle.isBlocked).toBe(true);
      expect(lifecycle.nextAction).toBeDefined();
      expect(lifecycle.nextAction?.priority).toBe('CRITICAL');
      expect(lifecycle.nextAction?.isBlocked).toBe(true);
      expect(lifecycle.nextAction?.actionType).toBe('RESOLVE_BLOCKER');
      expect(lifecycle.nextAction?.targetView).toBe('evidence');
      expect(lifecycle.nextAction?.buttonLabel).toBe('Go to Evidence Vault');

      const cleanEvidencePrereq = lifecycle.prerequisites?.items.find((p) => p.id === 'prereq-evidence-proof');
      expect(cleanEvidencePrereq).toBeDefined();
      expect(cleanEvidencePrereq?.isSatisfied).toBe(false);
      expect(lifecycle.prerequisites?.satisfiedCount).toBeLessThan(lifecycle.prerequisites?.totalCount || 5);
    });

    it('should identify operational test failure as HIGH blocker next action', async () => {
      prisma.control.findFirst.mockResolvedValue({
        id: 'c-failed-test',
        name: 'Database Encryption Control',
        mappings: [{ id: 'm-1', frameworkReferenceId: 'ref-1', status: 'APPROVED' }],
      });

      prisma.auditCheckItem.findMany.mockResolvedValue([
        {
          id: 'ci-fail',
          controlId: 'c-failed-test',
          result: AuditCheckResult.NON_COMPLIANT,
          updatedAt: new Date(),
          findings: [{ id: 'f-1', status: FindingStatus.OPEN }],
        },
      ]);

      const lifecycle = await service.getLifecycle('org-1', 'CONTROL', 'c-failed-test');

      expect(lifecycle.isBlocked).toBe(true);
      expect(lifecycle.nextAction).toBeDefined();
      expect(lifecycle.nextAction?.priority).toBe('HIGH');
      expect(lifecycle.nextAction?.isBlocked).toBe(true);
      expect(lifecycle.nextAction?.targetView).toBe('audits');
      expect(lifecycle.nextAction?.buttonLabel).toBe('View Audit Records');

      const testPrereq = lifecycle.prerequisites?.items.find((p) => p.id === 'prereq-operational-testing');
      expect(testPrereq?.isSatisfied).toBe(false);
    });

    it('should identify pending governance approval as HIGH next action', async () => {
      prisma.control.findFirst.mockResolvedValue({
        id: 'c-pending-approval',
        name: 'Key Rotation Control',
        mappings: [{ id: 'm-1', frameworkReferenceId: 'ref-1', status: 'APPROVED' }],
      });

      prisma.approvalInstance.findMany.mockResolvedValue([
        {
          id: 'appr-1',
          status: ApprovalInstanceStatus.PENDING,
          policy: null,
        },
      ]);

      const lifecycle = await service.getLifecycle('org-1', 'CONTROL', 'c-pending-approval');

      expect(lifecycle.isBlocked).toBe(false);
      expect(lifecycle.nextAction).toBeDefined();
      expect(lifecycle.nextAction?.priority).toBe('HIGH');
      expect(lifecycle.nextAction?.actionType).toBe('AWAIT_APPROVAL');
      expect(lifecycle.nextAction?.targetView).toBe('approvals');
      expect(lifecycle.nextAction?.buttonLabel).toBe('Open Approval Center');

      const approvalPrereq = lifecycle.prerequisites?.items.find((p) => p.id === 'prereq-approvals');
      expect(approvalPrereq?.isSatisfied).toBe(false);
    });

    it('should identify missing framework mapping as MEDIUM next action', async () => {
      prisma.control.findFirst.mockResolvedValue({
        id: 'c-unmapped',
        name: 'Access Review Control',
        mappings: [], // no mappings
      });

      const lifecycle = await service.getLifecycle('org-1', 'CONTROL', 'c-unmapped');

      expect(lifecycle.isBlocked).toBe(false);
      expect(lifecycle.nextAction).toBeDefined();
      expect(lifecycle.nextAction?.priority).toBe('MEDIUM');
      expect(lifecycle.nextAction?.actionType).toBe('MAP_FRAMEWORK');
      expect(lifecycle.nextAction?.isBlocked).toBe(false);
      expect(lifecycle.nextAction?.targetView).toBe('controls');
      expect(lifecycle.nextAction?.buttonLabel).toBe('Map Framework Clause');

      const fwPrereq = lifecycle.prerequisites?.items.find((p) => p.id === 'prereq-framework-mapping');
      expect(fwPrereq?.isSatisfied).toBe(false);
    });

    it('should mark prerequisites fully satisfied and report LIFECYCLE_COMPLETE when all gates pass', async () => {
      prisma.control.findFirst.mockResolvedValue({
        id: 'c-complete',
        name: 'MFA Enforcement Control',
        mappings: [{ id: 'm-1', frameworkReferenceId: 'ref-1', status: 'APPROVED' }],
      });

      prisma.frameworkReference.findFirst.mockResolvedValue({
        id: 'ref-1',
        identifier: 'A.9.2',
        title: 'User Access Control',
        frameworkVersionId: 'fv-1',
        frameworkVersion: {
          frameworkId: 'fw-1',
          framework: { code: 'ISO27001' },
        },
      });

      prisma.controlEvidence.findMany.mockResolvedValue([
        {
          evidence: {
            id: 'ev-clean',
            title: 'Okta MFA Policy Export',
            fileName: 'mfa.json',
            scanStatus: EvidenceScanStatus.CLEAN,
            status: 'ACTIVE',
          },
        },
      ]);

      prisma.auditCheckItem.findMany.mockResolvedValue([
        {
          id: 'ci-pass',
          controlId: 'c-complete',
          result: AuditCheckResult.COMPLIANT,
          updatedAt: new Date(),
          findings: [],
        },
      ]);

      prisma.approvalInstance.findMany.mockResolvedValue([
        {
          id: 'appr-ok',
          status: ApprovalInstanceStatus.APPROVED,
          policy: null,
        },
      ]);

      const lifecycle = await service.getLifecycle('org-1', 'CONTROL', 'c-complete');

      expect(lifecycle.isBlocked).toBe(false);
      expect(lifecycle.nextAction).toBeDefined();
      expect(lifecycle.nextAction?.actionType).toBe('LIFECYCLE_COMPLETE');
      expect(lifecycle.prerequisites).toBeDefined();
      expect(lifecycle.prerequisites?.satisfiedCount).toBe(lifecycle.prerequisites?.totalCount);
    });
  });

  describe('Phase 5.1 — Fix B: Operational Testing Availability & Anti-False-Compliance Verification', () => {
    const setupPassingPrereqs = () => {
      prisma.control.findFirst.mockResolvedValue({
        id: 'c-passing',
        name: 'Access Control',
        mappings: [{ id: 'm-1', frameworkReferenceId: 'ref-1', status: 'APPROVED' }],
      });
      prisma.frameworkReference.findFirst.mockResolvedValue({
        id: 'ref-1',
        identifier: 'A.9.1',
        title: 'Access Policy',
        frameworkVersionId: 'fv-1',
        frameworkVersion: { frameworkId: 'fw-1', framework: { code: 'ISO27001' } },
      });
      prisma.controlEvidence.findMany.mockResolvedValue([
        {
          evidence: {
            id: 'ev-1',
            title: 'Policy Doc',
            fileName: 'policy.pdf',
            scanStatus: EvidenceScanStatus.CLEAN,
            status: 'ACTIVE',
          },
        },
      ]);
      prisma.approvalInstance.findMany.mockResolvedValue([
        { id: 'appr-1', status: ApprovalInstanceStatus.APPROVED },
      ]);
      remediationService.findAll.mockResolvedValue({ total: 0, items: [] });
    };

    it('should return TESTING_UNAVAILABLE when BUSINESS_AUDITS is unlicensed, preventing false LIFECYCLE_COMPLETE', async () => {
      setupPassingPrereqs();
      effectiveResolver.resolveEffectiveState.mockImplementation(async (orgId, code) => {
        if (code === 'BUSINESS_AUDITS') {
          return { capabilityCode: code, effectiveState: 'UNLICENSED', isAvailable: false, reason: 'Unlicensed', source: 'TIER_RESTRICTION' };
        }
        return { capabilityCode: code, effectiveState: 'AVAILABLE', isAvailable: true, reason: 'Active', source: 'CATALOG_DEFAULT' };
      });

      const lifecycle = await service.getLifecycle('org-1', 'CONTROL', 'c-passing');

      expect(lifecycle.nextAction).toBeDefined();
      expect(lifecycle.nextAction?.actionType).toBe('TESTING_UNAVAILABLE');
      expect(lifecycle.nextAction?.title).toBe('Operational Testing Unavailable');
      expect(lifecycle.nextAction?.priority).toBe('LOW');
      expect(lifecycle.isBlocked).toBe(false);

      const testPrereq = lifecycle.prerequisites?.items.find((p) => p.id === 'prereq-operational-testing');
      expect(testPrereq?.isSatisfied).toBe(false);
      expect(testPrereq?.reason).toContain('unentitled or disabled');
      expect(lifecycle.prerequisites?.satisfiedCount).toBeLessThan(lifecycle.prerequisites?.totalCount!);
    });

    it('should return TESTING_UNAVAILABLE when BUSINESS_AUDITS is disabled via organization override', async () => {
      setupPassingPrereqs();
      effectiveResolver.resolveEffectiveState.mockImplementation(async (orgId, code) => {
        if (code === 'BUSINESS_AUDITS') {
          return { capabilityCode: code, effectiveState: 'DISABLED', isAvailable: false, reason: 'Disabled override', source: 'ORGANIZATION_SERVICE_OVERRIDE' };
        }
        return { capabilityCode: code, effectiveState: 'AVAILABLE', isAvailable: true, reason: 'Active', source: 'CATALOG_DEFAULT' };
      });

      const lifecycle = await service.getLifecycle('org-1', 'CONTROL', 'c-passing');

      expect(lifecycle.nextAction?.actionType).toBe('TESTING_UNAVAILABLE');
      expect(lifecycle.nextAction?.title).toBe('Operational Testing Unavailable');
      expect(lifecycle.prerequisites?.items.find((p) => p.id === 'prereq-operational-testing')?.isSatisfied).toBe(false);
    });

    it('should prompt to register control for testing when testing is available but zero tests exist', async () => {
      setupPassingPrereqs();
      prisma.auditCheckItem.findMany.mockResolvedValue([]);

      const lifecycle = await service.getLifecycle('org-1', 'CONTROL', 'c-passing');

      expect(lifecycle.nextAction?.actionType).toBe('EXECUTE_TEST');
      expect(lifecycle.nextAction?.title).toBe('Register Control for Operational Audit Testing');
      expect(lifecycle.nextAction?.targetView).toBe('audits');
      expect(lifecycle.prerequisites?.items.find((p) => p.id === 'prereq-operational-testing')?.isSatisfied).toBe(false);
    });

    it('should prompt to evaluate operational testing when tests are registered but unevaluated', async () => {
      setupPassingPrereqs();
      prisma.auditCheckItem.findMany.mockResolvedValue([
        {
          id: 'ci-unevaluated',
          controlId: 'c-passing',
          result: AuditCheckResult.NOT_EVALUATED,
          updatedAt: new Date(),
          findings: [],
        },
      ]);

      const lifecycle = await service.getLifecycle('org-1', 'CONTROL', 'c-passing');

      expect(lifecycle.nextAction?.actionType).toBe('EXECUTE_TEST');
      expect(lifecycle.nextAction?.title).toBe('Evaluate Operational Control Testing');
      expect(lifecycle.prerequisites?.items.find((p) => p.id === 'prereq-operational-testing')?.isSatisfied).toBe(false);
      expect(lifecycle.prerequisites?.items.find((p) => p.id === 'prereq-operational-testing')?.reason).toContain('unevaluated');
    });

    it('should return blocker next action when latest test failed (NON_COMPLIANT)', async () => {
      setupPassingPrereqs();
      prisma.auditCheckItem.findMany.mockResolvedValue([
        {
          id: 'ci-failed',
          controlId: 'c-passing',
          result: AuditCheckResult.NON_COMPLIANT,
          updatedAt: new Date(),
          findings: [],
        },
      ]);

      const lifecycle = await service.getLifecycle('org-1', 'CONTROL', 'c-passing');

      expect(lifecycle.isBlocked).toBe(true);
      expect(lifecycle.nextAction?.actionType).toBe('RESOLVE_BLOCKER');
      expect(lifecycle.nextAction?.priority).toBe('HIGH');
      expect(lifecycle.nextAction?.title).toBe('Remediate Operational Testing Failure');
      expect(lifecycle.prerequisites?.items.find((p) => p.id === 'prereq-operational-testing')?.isSatisfied).toBe(false);
    });

    it('should prompt to remediate partial compliance when latest test is PARTIALLY_COMPLIANT', async () => {
      setupPassingPrereqs();
      prisma.auditCheckItem.findMany.mockResolvedValue([
        {
          id: 'ci-partial',
          controlId: 'c-passing',
          result: AuditCheckResult.PARTIALLY_COMPLIANT,
          updatedAt: new Date(),
          findings: [],
        },
      ]);

      const lifecycle = await service.getLifecycle('org-1', 'CONTROL', 'c-passing');

      expect(lifecycle.nextAction?.actionType).toBe('EXECUTE_TEST');
      expect(lifecycle.nextAction?.title).toBe('Remediate Partial Compliance Testing Outcome');
      expect(lifecycle.nextAction?.priority).toBe('HIGH');
      expect(lifecycle.prerequisites?.items.find((p) => p.id === 'prereq-operational-testing')?.isSatisfied).toBe(false);
    });
  });

  describe('Phase 5.1 — Fix C: Suggested vs Approved Framework Mapping Prerequisite Semantics', () => {
    const setupBaseControl = (mappings: Array<{ id: string; frameworkReferenceId: string; status: string }>) => {
      prisma.control.findFirst.mockResolvedValue({
        id: 'c-mapping-test',
        name: 'Encryption Control',
        mappings,
      });
      prisma.frameworkReference.findFirst.mockImplementation(async ({ where }: any) => {
        return {
          id: where.id,
          identifier: 'A.10.1',
          title: 'Cryptographic Controls',
          frameworkVersionId: 'fv-1',
          frameworkVersion: { frameworkId: 'fw-1', framework: { code: 'ISO27001' } },
        };
      });
    };

    it('should satisfy framework mapping prerequisite when mapping is APPROVED', async () => {
      setupBaseControl([{ id: 'm-1', frameworkReferenceId: 'ref-1', status: 'APPROVED' }]);

      const lifecycle = await service.getLifecycle('org-1', 'CONTROL', 'c-mapping-test');
      const fwPrereq = lifecycle.prerequisites?.items.find((p) => p.id === 'prereq-framework-mapping');

      expect(fwPrereq?.isSatisfied).toBe(true);
      expect(fwPrereq?.reason).toContain('Mapped to ISO27001 (A.10.1)');
    });

    it('should NOT satisfy prerequisite when mapping is SUGGESTED only', async () => {
      setupBaseControl([{ id: 'm-sug', frameworkReferenceId: 'ref-1', status: 'SUGGESTED' }]);

      const lifecycle = await service.getLifecycle('org-1', 'CONTROL', 'c-mapping-test');
      const fwPrereq = lifecycle.prerequisites?.items.find((p) => p.id === 'prereq-framework-mapping');

      expect(fwPrereq?.isSatisfied).toBe(false);
      expect(fwPrereq?.reason).toBe('Framework mapping is suggested and requires governance approval.');
      expect(lifecycle.nextAction?.actionType).toBe('MAP_FRAMEWORK');
      expect(lifecycle.nextAction?.title).toBe('Review and Approve Suggested Framework Mapping');
      expect(lifecycle.nextAction?.buttonLabel).toBe('Review Mapping');
    });

    it('should NOT satisfy prerequisite when mapping is REJECTED only', async () => {
      setupBaseControl([{ id: 'm-rej', frameworkReferenceId: 'ref-1', status: 'REJECTED' }]);

      const lifecycle = await service.getLifecycle('org-1', 'CONTROL', 'c-mapping-test');
      const fwPrereq = lifecycle.prerequisites?.items.find((p) => p.id === 'prereq-framework-mapping');

      expect(fwPrereq?.isSatisfied).toBe(false);
      expect(fwPrereq?.reason).toBe('Framework mapping was rejected by governance reviewer.');
      expect(lifecycle.nextAction?.actionType).toBe('MAP_FRAMEWORK');
      expect(lifecycle.nextAction?.title).toBe('Map Control to Compliance Framework Clause');
    });

    it('should satisfy prerequisite when SUGGESTED and APPROVED coexist without being masked', async () => {
      setupBaseControl([
        { id: 'm-sug', frameworkReferenceId: 'ref-sug', status: 'SUGGESTED' },
        { id: 'm-appr', frameworkReferenceId: 'ref-appr', status: 'APPROVED' },
      ]);

      const lifecycle = await service.getLifecycle('org-1', 'CONTROL', 'c-mapping-test');
      const fwPrereq = lifecycle.prerequisites?.items.find((p) => p.id === 'prereq-framework-mapping');

      expect(fwPrereq?.isSatisfied).toBe(true);
      expect(fwPrereq?.reason).toContain('Mapped to ISO27001 (A.10.1)');
    });

    it('should NOT satisfy prerequisite when multiple mappings exist but none are APPROVED', async () => {
      setupBaseControl([
        { id: 'm-sug', frameworkReferenceId: 'ref-1', status: 'SUGGESTED' },
        { id: 'm-rej', frameworkReferenceId: 'ref-2', status: 'REJECTED' },
      ]);

      const lifecycle = await service.getLifecycle('org-1', 'CONTROL', 'c-mapping-test');
      const fwPrereq = lifecycle.prerequisites?.items.find((p) => p.id === 'prereq-framework-mapping');

      expect(fwPrereq?.isSatisfied).toBe(false);
      expect(fwPrereq?.reason).toBe('Framework mapping is suggested and requires governance approval.');
    });

    it('should reflect approval state changes dynamically in the prerequisite result', async () => {
      setupBaseControl([{ id: 'm-1', frameworkReferenceId: 'ref-1', status: 'SUGGESTED' }]);
      const beforeApproval = await service.getLifecycle('org-1', 'CONTROL', 'c-mapping-test');
      expect(beforeApproval.prerequisites?.items.find((p) => p.id === 'prereq-framework-mapping')?.isSatisfied).toBe(false);

      setupBaseControl([{ id: 'm-1', frameworkReferenceId: 'ref-1', status: 'APPROVED' }]);
      const afterApproval = await service.getLifecycle('org-1', 'CONTROL', 'c-mapping-test');
      expect(afterApproval.prerequisites?.items.find((p) => p.id === 'prereq-framework-mapping')?.isSatisfied).toBe(true);

      setupBaseControl([{ id: 'm-1', frameworkReferenceId: 'ref-1', status: 'REJECTED' }]);
      const afterRejection = await service.getLifecycle('org-1', 'CONTROL', 'c-mapping-test');
      expect(afterRejection.prerequisites?.items.find((p) => p.id === 'prereq-framework-mapping')?.isSatisfied).toBe(false);
    });
  });

  describe('Phase 5.1 — Fix D: Multi-Blocker Priority Cascade Regression Coverage', () => {
    it('quarantined evidence wins over rejected approval (CRITICAL precedence)', async () => {
      prisma.control.findFirst.mockResolvedValue({
        id: 'c-multi-1',
        name: 'Multi Blocker 1',
        mappings: [{ id: 'm-1', frameworkReferenceId: 'ref-1', status: 'APPROVED' }],
      });
      prisma.controlEvidence.findMany.mockResolvedValue([
        {
          evidence: {
            id: 'ev-quar',
            title: 'Malicious File',
            fileName: 'malware.exe',
            scanStatus: EvidenceScanStatus.QUARANTINED,
            status: 'ACTIVE',
          },
        },
      ]);
      prisma.approvalInstance.findMany.mockResolvedValue([
        { id: 'appr-rej', status: ApprovalInstanceStatus.REJECTED },
      ]);

      const lifecycle = await service.getLifecycle('org-1', 'CONTROL', 'c-multi-1');

      expect(lifecycle.isBlocked).toBe(true);
      expect(lifecycle.nextAction?.actionType).toBe('RESOLVE_BLOCKER');
      expect(lifecycle.nextAction?.title).toBe('Replace Quarantined Proof Artifact');
      expect(lifecycle.nextAction?.targetView).toBe('evidence');
      expect(lifecycle.nextAction?.priority).toBe('CRITICAL');
    });

    it('overdue remediation wins over missing evidence (CRITICAL over MEDIUM)', async () => {
      prisma.control.findFirst.mockResolvedValue({
        id: 'c-multi-2',
        name: 'Multi Blocker 2',
        mappings: [{ id: 'm-1', frameworkReferenceId: 'ref-1', status: 'APPROVED' }],
      });
      prisma.controlEvidence.findMany.mockResolvedValue([]); // Missing evidence
      remediationService.findAll.mockResolvedValue({
        total: 1,
        items: [
          {
            id: 'rem-overdue',
            sourceId: 'c-multi-2',
            title: 'Patch SLA Breach',
            status: 'OPEN',
            dueDate: new Date(Date.now() - 86400000).toISOString(),
            isOverdue: true,
          },
        ],
      });

      const lifecycle = await service.getLifecycle('org-1', 'CONTROL', 'c-multi-2');

      expect(lifecycle.isBlocked).toBe(true);
      expect(lifecycle.nextAction?.actionType).toBe('COMPLETE_REMEDIATION');
      expect(lifecycle.nextAction?.title).toBe('Resolve Overdue Action Plan');
      expect(lifecycle.nextAction?.targetView).toBe('remediation');
      expect(lifecycle.nextAction?.priority).toBe('CRITICAL');
    });

    it('failed testing wins over pending approval (HIGH blocker precedence)', async () => {
      prisma.control.findFirst.mockResolvedValue({
        id: 'c-multi-3',
        name: 'Multi Blocker 3',
        mappings: [{ id: 'm-1', frameworkReferenceId: 'ref-1', status: 'APPROVED' }],
      });
      prisma.auditCheckItem.findMany.mockResolvedValue([
        {
          id: 'ci-fail',
          controlId: 'c-multi-3',
          result: AuditCheckResult.NON_COMPLIANT,
          updatedAt: new Date(),
          findings: [],
        },
      ]);
      prisma.approvalInstance.findMany.mockResolvedValue([
        { id: 'appr-pend', status: ApprovalInstanceStatus.PENDING },
      ]);

      const lifecycle = await service.getLifecycle('org-1', 'CONTROL', 'c-multi-3');

      expect(lifecycle.isBlocked).toBe(true);
      expect(lifecycle.nextAction?.actionType).toBe('RESOLVE_BLOCKER');
      expect(lifecycle.nextAction?.title).toBe('Remediate Operational Testing Failure');
      expect(lifecycle.nextAction?.targetView).toBe('audits');
      expect(lifecycle.nextAction?.priority).toBe('HIGH');
    });

    it('unresolved findings win over missing framework mapping (MEDIUM precedence)', async () => {
      prisma.control.findFirst.mockResolvedValue({
        id: 'c-multi-4',
        name: 'Multi Blocker 4',
        mappings: [], // missing framework mapping
      });
      prisma.auditCheckItem.findMany.mockResolvedValue([
        {
          id: 'ci-findings',
          controlId: 'c-multi-4',
          result: AuditCheckResult.COMPLIANT,
          updatedAt: new Date(),
          findings: [{ id: 'f-1', status: FindingStatus.OPEN }],
        },
      ]);

      const lifecycle = await service.getLifecycle('org-1', 'CONTROL', 'c-multi-4');

      expect(lifecycle.isBlocked).toBe(false);
      expect(lifecycle.nextAction?.actionType).toBe('COMPLETE_REMEDIATION');
      expect(lifecycle.nextAction?.title).toBe('Remediate Open Audit Deficiencies');
      expect(lifecycle.nextAction?.targetView).toBe('remediation');
      expect(lifecycle.nextAction?.priority).toBe('MEDIUM');
    });

    it('quarantined evidence blocker remains visible when testing is unavailable', async () => {
      prisma.control.findFirst.mockResolvedValue({
        id: 'c-multi-5',
        name: 'Multi Blocker 5',
        mappings: [{ id: 'm-1', frameworkReferenceId: 'ref-1', status: 'APPROVED' }],
      });
      prisma.controlEvidence.findMany.mockResolvedValue([
        {
          evidence: {
            id: 'ev-quar',
            title: 'Malware Proof',
            fileName: 'malware.bin',
            scanStatus: EvidenceScanStatus.QUARANTINED,
            status: 'ACTIVE',
          },
        },
      ]);
      effectiveResolver.resolveEffectiveState.mockImplementation(async (orgId, code) => {
        if (code === 'BUSINESS_AUDITS') {
          return { capabilityCode: code, effectiveState: 'UNLICENSED', isAvailable: false, reason: 'Unlicensed', source: 'TIER_RESTRICTION' };
        }
        return { capabilityCode: code, effectiveState: 'AVAILABLE', isAvailable: true, reason: 'Active', source: 'CATALOG_DEFAULT' };
      });

      const lifecycle = await service.getLifecycle('org-1', 'CONTROL', 'c-multi-5');

      expect(lifecycle.isBlocked).toBe(true);
      expect(lifecycle.nextAction?.actionType).toBe('RESOLVE_BLOCKER');
      expect(lifecycle.nextAction?.title).toBe('Replace Quarantined Proof Artifact');
      expect(lifecycle.nextAction?.targetView).toBe('evidence');
      expect(lifecycle.nextAction?.priority).toBe('CRITICAL');
    });
  });
});
