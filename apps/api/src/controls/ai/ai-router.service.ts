import { Injectable, Logger } from '@nestjs/common';
import { GeminiProvider } from './gemini.provider';
import { ClaudeProvider } from './claude.provider';
import { MockAiProvider } from './mock-ai.provider';
import { AiProvider, CandidateClause, AiMappingResponse, SuggestedMappingItem } from './ai-provider.interface';
import { ModelTier } from '@omnigrc/shared';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';

@Injectable()
export class AiRouterService {
  private readonly logger = new Logger(AiRouterService.name);

  constructor(
    private readonly geminiProvider: GeminiProvider,
    private readonly claudeProvider: ClaudeProvider,
    private readonly mockAiProvider: MockAiProvider,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /**
   * Classify routine vs. ambiguous/high-stakes control with heuristic routing (~80% Tier 1, ~20% Tier 2)
   */
  public classifyTier(controlName: string, controlDescription: string): ModelTier {
    const desc = `${controlName} ${controlDescription}`.toLowerCase();
    const isAmbiguousOrHighStakes =
      desc.length > 250 ||
      desc.includes('may') ||
      desc.includes('depending') ||
      desc.includes('partial') ||
      desc.includes('ai system') ||
      desc.includes('machine learning') ||
      desc.includes('cross-border');

    return isAmbiguousOrHighStakes ? ModelTier.TIER_2 : ModelTier.TIER_1;
  }

  /**
   * Route and execute AI call based on tier classification and key availability
   */
  async executeMapping(params: {
    organizationId: string;
    actorId: string;
    controlId: string;
    controlName: string;
    controlDescription: string;
    candidates: CandidateClause[];
  }): Promise<{ acceptedSuggestions: SuggestedMappingItem[]; tierUsed: ModelTier }> {
    const { organizationId, actorId, controlId, controlName, controlDescription, candidates } = params;

    const targetTier = this.classifyTier(controlName, controlDescription);
    this.logger.log(`Tier classification for Control "${controlName}": ${targetTier}`);

    let provider: AiProvider = this.mockAiProvider;
    let actualTier = targetTier;

    if (targetTier === ModelTier.TIER_2) {
      if (this.claudeProvider.isAvailable()) {
        provider = this.claudeProvider;
      } else if (this.geminiProvider.isAvailable()) {
        this.logger.warn(`Tier 2 requested but Anthropic key is missing — Routing Tier 2 to GeminiProvider.`);
        provider = this.geminiProvider;
      } else {
        this.logger.warn(`Tier 2 requested but external keys are missing — Routing Tier 2 to MockAiProvider.`);
        provider = this.mockAiProvider;
      }
    } else {
      // Tier 1
      if (this.geminiProvider.isAvailable()) {
        provider = this.geminiProvider;
      } else {
        this.logger.warn(`Tier 1 requested but Gemini key is missing — Routing Tier 1 to MockAiProvider.`);
        provider = this.mockAiProvider;
      }
    }

    let rawResponse: AiMappingResponse;
    try {
      rawResponse = await provider.suggestMappings({ controlName, controlDescription, candidates });
    } catch (err: any) {
      this.logger.error(`Primary provider ${provider.constructor.name} failed: ${err.message}. Falling back to MockAiProvider.`);
      rawResponse = await this.mockAiProvider.suggestMappings({ controlName, controlDescription, candidates });
    }

    actualTier = rawResponse.modelTier || targetTier;
    this.logger.log(`Job executed via provider: ${rawResponse.providerName} (${actualTier})`);

    // STAGE 2d: RESPONSE VALIDATOR
    const validCandidateIds = new Set(candidates.map((c) => c.id));
    const acceptedSuggestions: SuggestedMappingItem[] = [];

    for (const item of rawResponse.suggestions) {
      const isValidClause = validCandidateIds.has(item.clauseId);
      const isConfidenceValid = typeof item.confidenceScore === 'number' && item.confidenceScore >= 0.5;

      if (!isValidClause || !isConfidenceValid) {
        this.logger.warn(
          `REJECTED AI Suggestion for Control ${controlId}: Clause ${item.clauseCode} (${item.clauseId}), Confidence: ${item.confidenceScore}. Reason: ${
            !isValidClause ? 'Invalid clause ID not in candidates list' : 'Confidence score below 0.5 threshold'
          }`
        );

        // Audit Log for REJECTED suggestion (Metadata only)
        await this.auditLogsService.log({
          organizationId,
          actorId,
          action: 'MAPPING_REJECTED',
          entityType: 'Control',
          entityId: controlId,
          metadata: {
            controlId,
            frameworkCode: item.frameworkCode,
            clauseCode: item.clauseCode,
            clauseId: item.clauseId,
            confidenceScore: item.confidenceScore,
            modelTier: actualTier,
            rejectionReason: !isValidClause ? 'CLAUSE_NOT_IN_CANDIDATES' : 'CONFIDENCE_BELOW_THRESHOLD',
          },
        });
      } else {
        acceptedSuggestions.push(item);
      }
    }

    return {
      acceptedSuggestions,
      tierUsed: actualTier,
    };
  }
}
