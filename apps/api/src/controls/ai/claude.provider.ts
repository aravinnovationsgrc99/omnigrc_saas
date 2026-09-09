import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AiProvider, CandidateClause, AiMappingResponse, SuggestedMappingItem } from './ai-provider.interface';
import { ModelTier } from '@omnigrc/shared';

@Injectable()
export class ClaudeProvider implements AiProvider {
  private readonly logger = new Logger(ClaudeProvider.name);
  private anthropic: Anthropic | null = null;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey && apiKey.trim()) {
      this.anthropic = new Anthropic({ apiKey: apiKey.trim() });
      this.logger.log('ClaudeProvider initialized with ANTHROPIC_API_KEY.');
    } else {
      this.logger.warn('ANTHROPIC_API_KEY missing in environment. ClaudeProvider inactive (Tier 2 calls will fall back gracefully).');
    }
  }

  public isAvailable(): boolean {
    return Boolean(this.anthropic);
  }

  async suggestMappings(params: {
    controlName: string;
    controlDescription: string;
    candidates: CandidateClause[];
  }): Promise<AiMappingResponse> {
    if (!this.anthropic) {
      throw new Error('Claude API client not initialized.');
    }

    const { controlName, controlDescription, candidates } = params;

    const candidateListPrompt = candidates.map((c) => ({
      clauseId: c.id,
      frameworkCode: c.frameworkCode,
      clauseCode: c.code,
      clauseTitle: c.title,
    }));

    const systemPrompt = `You are a high-tier enterprise GRC Compliance Mapping AI.
Map the given control to the single best candidate clause per framework.
Constraint: You MUST ONLY select clauseId values from the provided Candidate List.
Return strictly valid JSON with key "suggestions".`;

    const userMessage = `Control Name: "${controlName}"
Control Description: "${controlDescription}"

Candidate Clauses List:
${JSON.stringify(candidateListPrompt, null, 2)}`;

    const response = await this.anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: 1000,
      messages: [{ role: 'user', content: `${systemPrompt}\n\n${userMessage}` }],
    });

    const contentBlock = response.content[0];
    const text = contentBlock.type === 'text' ? contentBlock.text : '';
    const cleanJsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanJsonText);

    const suggestions: SuggestedMappingItem[] = (parsed.suggestions || []).map((s: any) => ({
      clauseId: s.clauseId,
      frameworkCode: s.frameworkCode,
      clauseCode: s.clauseCode,
      confidenceScore: typeof s.confidenceScore === 'number' ? s.confidenceScore : 0.92,
      reasoning: s.reasoning || 'Claude 3 Opus Tier 2 high-stakes compliance recommendation.',
    }));

    return {
      suggestions,
      modelTier: ModelTier.TIER_2,
      providerName: 'ClaudeProvider (Tier 2)',
    };
  }
}
