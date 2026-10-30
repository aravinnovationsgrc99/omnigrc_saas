import { RegulatoryImpactAnalysisService } from './regulatory-impact-analysis.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { GeminiProvider } from '../../controls/ai/gemini.provider';
import { MockAiProvider } from '../../controls/ai/mock-ai.provider';

describe('RegulatoryImpactAnalysisService (AI Regulatory Documentation & Impact Analysis)', () => {
  let service: RegulatoryImpactAnalysisService;
  let mockPrisma: any;
  let mockAuditLogs: any;
  let mockGeminiProvider: any;
  let mockMockAiProvider: any;

  const mockOrgId = '00000000-0000-0000-0000-000000000001';
  const mockActorId = 'actor-user-1';
  const mockPubId = 'pub-rbi-cyber-2024';

  beforeEach(() => {
    mockPrisma = {
      regulatoryPublication: {
        findUnique: jest.fn().mockResolvedValue({
          id: mockPubId,
          title: 'RBI IT Governance, Risk and Cyber Resilience Master Directions 2024',
          publicationNumber: 'RBI/2024-25/11',
          source: { regulatorCode: 'RBI', displayName: 'Reserve Bank of India' },
          currentVersionNumber: 1,
          versions: [],
          currentDocumentMetadata: {
            fullText: 'Section 5.3: Regulated Entities shall report all major cyber security incidents to the Reserve Bank within six (6) hours of detection.',
          },
        }),
      },
      control: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'ctrl-1', category: 'INCIDENT', name: 'Incident Response Policy', description: 'Mandates incident reporting.' },
          { id: 'ctrl-2', category: 'ACCESS', name: 'MFA Enforcement', description: 'Requires MFA on admin accounts.' },
        ]),
      },
      regulatoryRemediationTask: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'rem-1', title: 'Upgrade SOC alerting to 6-hour window', status: 'IN_PROGRESS', priority: 'HIGH' },
        ]),
      },
    };

    mockAuditLogs = {
      log: jest.fn().mockResolvedValue({} as any),
    };

    mockGeminiProvider = {
      isAvailable: jest.fn().mockReturnValue(false),
      generateText: jest.fn(),
    };

    mockMockAiProvider = {
      isAvailable: jest.fn().mockReturnValue(true),
    };

    service = new RegulatoryImpactAnalysisService(
      mockPrisma,
      mockAuditLogs,
      mockGeminiProvider,
      mockMockAiProvider,
    );
  });

  describe('1. analyzePublicationImpact', () => {
    it('should analyze publication impact using fallback deterministic engine when Gemini is unavailable', async () => {
      const report = await service.analyzePublicationImpact(mockPubId, mockOrgId, mockActorId, {
        forceReanalysis: true,
      });

      expect(report.publicationId).toBe(mockPubId);
      expect(report.regulatorCode).toBe('RBI');
      expect(report.isFallback).toBe(true);
      expect(report.findings.length).toBeGreaterThan(0);
      expect(report.humanReviewRequired).toBe(true);
      expect(report.status).toBe('PENDING_HUMAN_REVIEW');

      // Verify each finding has source text, AI interpretation, and recommended action
      for (const f of report.findings) {
        expect(f.sourceTextExcerpt).toBeTruthy();
        expect(f.aiInterpretation).toBeTruthy();
        expect(f.recommendedAction).toBeTruthy();
        expect(f.isHumanReviewed).toBe(false);
      }

      // Verify audit log call
      expect(mockAuditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REGULATORY_PUBLICATION_AI_ANALYSIS_GENERATED',
          organizationId: mockOrgId,
          entityId: mockPubId,
        }),
      );
    });

    it('should generate structured analysis via Gemini when GeminiProvider is available', async () => {
      mockGeminiProvider.isAvailable.mockReturnValue(true);
      mockGeminiProvider.generateText.mockResolvedValueOnce(
        JSON.stringify({
          executiveSummary: 'Gemini evaluated RBI circular with high compliance impact.',
          overallComplianceRisk: 'CRITICAL',
          findings: [
            {
              sourceTextExcerpt: 'Mandatory 6-hour reporting window.',
              clauseReference: 'Section 5.3',
              changeType: 'MODIFIED',
              aiInterpretation: 'Strict reporting window.',
              potentialOrganizationalImpact: 'SOC playbook update needed.',
              recommendedAction: 'Automate reporting script.',
              confidence: 'HIGH',
              confidenceScore: 0.98,
            },
          ],
          affectedControls: [
            {
              controlId: 'ctrl-1',
              controlName: 'Incident Response Policy',
              impactNature: 'CONTROL_ENHANCEMENT_REQUIRED',
              rationale: 'Must reflect 6-hour threshold.',
              suggestedAction: 'Update procedure.',
            },
          ],
          affectedRemediations: [],
        }),
      );

      const report = await service.analyzePublicationImpact(mockPubId, mockOrgId, mockActorId, {
        forceReanalysis: true,
      });

      expect(report.aiProviderUsed).toBe('GeminiProvider');
      expect(report.isFallback).toBe(false);
      expect(report.overallComplianceRisk).toBe('CRITICAL');
      expect(report.findings).toHaveLength(1);
      expect(report.findings[0].clauseReference).toBe('Section 5.3');
      expect(report.humanReviewRequired).toBe(true);
    });
  });

  describe('2. reviewFinding (Human Review Workflow)', () => {
    it('should record compliance officer review decision and update review status', async () => {
      // 1. Generate report
      const initialReport = await service.analyzePublicationImpact(mockPubId, mockOrgId, mockActorId, {
        forceReanalysis: true,
      });
      const findingId = initialReport.findings[0].id;

      // 2. Review first finding
      const reviewedReport = await service.reviewFinding(mockPubId, mockOrgId, mockActorId, {
        findingId,
        decision: 'ACCEPTED',
        reviewNotes: 'Verified with CISO. Proceeding with SOC playbook update.',
      });

      const reviewedFinding = reviewedReport.findings.find((f) => f.id === findingId);
      expect(reviewedFinding?.isHumanReviewed).toBe(true);
      expect(reviewedFinding?.humanReviewDecision).toBe('ACCEPTED');
      expect(reviewedFinding?.reviewNotes).toContain('Verified with CISO');
      expect(reviewedFinding?.reviewedById).toBe(mockActorId);

      // Verify audit log
      expect(mockAuditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REGULATORY_AI_FINDING_REVIEWED',
          entityId: findingId,
        }),
      );
    });
  });
});
