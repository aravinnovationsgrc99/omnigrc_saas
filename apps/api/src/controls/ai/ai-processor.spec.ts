import { Test, TestingModule } from '@nestjs/testing';
import { AiRouterService } from './ai-router.service';
import { MappingQueueService } from './mapping-queue.service';
import { GeminiProvider } from './gemini.provider';
import { ClaudeProvider } from './claude.provider';
import { MockAiProvider } from './mock-ai.provider';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { ModelTier } from '@omnigrc/shared';

describe('AI Job Processor & Router Unit Tests', () => {
  let routerService: AiRouterService;
  let mockAiProvider: MockAiProvider;
  let auditLogsService: jest.Mocked<any>;

  beforeEach(async () => {
    mockAiProvider = new MockAiProvider();
    auditLogsService = {
      log: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiRouterService,
        {
          provide: GeminiProvider,
          useValue: { isAvailable: () => false, suggestMappings: jest.fn() },
        },
        {
          provide: ClaudeProvider,
          useValue: { isAvailable: () => false, suggestMappings: jest.fn() },
        },
        { provide: MockAiProvider, useValue: mockAiProvider },
        { provide: AuditLogsService, useValue: auditLogsService },
      ],
    }).compile();

    routerService = module.get<AiRouterService>(AiRouterService);
  });

  it('should be defined', () => {
    expect(routerService).toBeDefined();
  });

  describe('(a) Payload Redaction', () => {
    it('should pass only control text and candidates to AI provider — never organizationId or user identity', async () => {
      const suggestSpy = jest.spyOn(mockAiProvider, 'suggestMappings');

      const candidates = [
        { id: 'clause-1', frameworkCode: 'ISO27001', code: 'A.9.1.1', title: 'Access Control' },
      ];

      await routerService.executeMapping({
        organizationId: 'secret-org-123',
        actorId: 'secret-user-456',
        controlId: 'ctrl-789',
        controlName: 'Access Control Policy',
        controlDescription: 'MFA enforcement for remote access',
        candidates,
      });

      expect(suggestSpy).toHaveBeenCalledWith({
        controlName: 'Access Control Policy',
        controlDescription: 'MFA enforcement for remote access',
        candidates,
      });

      const calledArgs = suggestSpy.mock.calls[0][0] as any;
      expect(calledArgs.organizationId).toBeUndefined();
      expect(calledArgs.actorId).toBeUndefined();
      expect(calledArgs.userId).toBeUndefined();
    });
  });

  describe('(b) Tiered Routing Classification', () => {
    it('should classify routine short control descriptions as TIER_1', () => {
      const tier = routerService.classifyTier('Password Policy', 'Standard 12-char password enforcement');
      expect(tier).toBe(ModelTier.TIER_1);
    });

    it('should classify ambiguous, AI/ML, or cross-border descriptions as TIER_2', () => {
      const tier1 = routerService.classifyTier('AI Model Governance', 'Machine Learning training data access control');
      const tier2 = routerService.classifyTier('Data Residency', 'Cross-border data transfer depending on region');

      expect(tier1).toBe(ModelTier.TIER_2);
      expect(tier2).toBe(ModelTier.TIER_2);
    });
  });

  describe('(c) Response Validator', () => {
    it('should REJECT a fabricated clause ID not present in candidates list', async () => {
      jest.spyOn(mockAiProvider, 'suggestMappings').mockResolvedValueOnce({
        suggestions: [
          {
            clauseId: 'FABRICATED-CLAUSE-999',
            frameworkCode: 'ISO27001',
            clauseCode: 'FAKE.1',
            confidenceScore: 0.95,
            reasoning: 'Hallucinated recommendation',
          },
        ],
        modelTier: ModelTier.TIER_1,
        providerName: 'MockAiProvider',
      });

      const candidates = [
        { id: 'valid-clause-1', frameworkCode: 'ISO27001', code: 'A.9.1.1', title: 'Access Control' },
      ];

      const res = await routerService.executeMapping({
        organizationId: 'org-1',
        actorId: 'user-1',
        controlId: 'ctrl-1',
        controlName: 'MFA Control',
        controlDescription: 'Enforce MFA',
        candidates,
      });

      expect(res.acceptedSuggestions).toHaveLength(0);
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MAPPING_REJECTED',
          metadata: expect.objectContaining({
            rejectionReason: 'CLAUSE_NOT_IN_CANDIDATES',
          }),
        }),
      );
    });

    it('should REJECT a candidate suggestion with confidence score < 0.5', async () => {
      jest.spyOn(mockAiProvider, 'suggestMappings').mockResolvedValueOnce({
        suggestions: [
          {
            clauseId: 'valid-clause-1',
            frameworkCode: 'ISO27001',
            clauseCode: 'A.9.1.1',
            confidenceScore: 0.35, // Below 0.5 threshold
            reasoning: 'Low confidence recommendation',
          },
        ],
        modelTier: ModelTier.TIER_1,
        providerName: 'MockAiProvider',
      });

      const candidates = [
        { id: 'valid-clause-1', frameworkCode: 'ISO27001', code: 'A.9.1.1', title: 'Access Control' },
      ];

      const res = await routerService.executeMapping({
        organizationId: 'org-1',
        actorId: 'user-1',
        controlId: 'ctrl-1',
        controlName: 'MFA Control',
        controlDescription: 'Enforce MFA',
        candidates,
      });

      expect(res.acceptedSuggestions).toHaveLength(0);
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MAPPING_REJECTED',
          metadata: expect.objectContaining({
            rejectionReason: 'CONFIDENCE_BELOW_THRESHOLD',
          }),
        }),
      );
    });

    it('should ACCEPT a valid candidate clause with confidence score >= 0.5', async () => {
      jest.spyOn(mockAiProvider, 'suggestMappings').mockResolvedValueOnce({
        suggestions: [
          {
            clauseId: 'valid-clause-1',
            frameworkCode: 'ISO27001',
            clauseCode: 'A.9.1.1',
            confidenceScore: 0.88,
            reasoning: 'High quality match',
          },
        ],
        modelTier: ModelTier.TIER_1,
        providerName: 'MockAiProvider',
      });

      const candidates = [
        { id: 'valid-clause-1', frameworkCode: 'ISO27001', code: 'A.9.1.1', title: 'Access Control' },
      ];

      const res = await routerService.executeMapping({
        organizationId: 'org-1',
        actorId: 'user-1',
        controlId: 'ctrl-1',
        controlName: 'MFA Control',
        controlDescription: 'Enforce MFA',
        candidates,
      });

      expect(res.acceptedSuggestions).toHaveLength(1);
      expect(res.acceptedSuggestions[0].clauseId).toBe('valid-clause-1');
    });
  });
});
