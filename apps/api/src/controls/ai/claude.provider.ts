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

    // GUARD: If candidate list is empty, skip external API call
    if (!candidates || candidates.length === 0) {
      this.logger.warn('Candidate clause list is empty — skipping Claude API call.');
      return {
        suggestions: [],
        modelTier: ModelTier.TIER_2,
        providerName: 'ClaudeProvider (Tier 2)',
      };
    }

    const candidateIds = candidates.map((c) => c.id);

    const candidateListPrompt = candidates.map((c) => ({
      clauseId: c.id,
      frameworkCode: c.frameworkCode,
      clauseCode: c.code,
      clauseTitle: c.title,
    }));

    const userMessage = `Control Name: "${controlName}"
Control Description: "${controlDescription}"

Candidate Clauses List:
${JSON.stringify(candidateListPrompt, null, 2)}`;

    // Constrain Claude using strict Tool Calling with enum schema & model claude-haiku-4-5-20251001
    const response = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      tools: [
        {
          name: 'submit_mapping_suggestions',
          description: 'Submit control framework mapping suggestions using ONLY valid candidate clause IDs from the provided list',
          input_schema: {
            type: 'object',
            properties: {
              suggestions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    clauseId: {
                      type: 'string',
                      enum: candidateIds,
                      description: 'The exact ID of the clause selected from the candidate list',
                    },
                    frameworkCode: { type: 'string' },
                    clauseCode: { type: 'string' },
                    confidenceScore: { type: 'number' },
                    reasoning: { type: 'string' },
                  },
                  required: ['clauseId', 'frameworkCode', 'clauseCode', 'confidenceScore', 'reasoning'],
                },
              },
            },
            required: ['suggestions'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_mapping_suggestions' },
      messages: [{ role: 'user', content: userMessage }],
    });

    const toolUseBlock = response.content.find((b) => b.type === 'tool_use') as Anthropic.ToolUseBlock | undefined;
    const rawSuggestions = (toolUseBlock?.input as any)?.suggestions || [];

    const suggestions: SuggestedMappingItem[] = rawSuggestions.map((s: any) => ({
      clauseId: s.clauseId,
      frameworkCode: s.frameworkCode,
      clauseCode: s.clauseCode,
      confidenceScore: typeof s.confidenceScore === 'number' ? s.confidenceScore : 0.92,
      reasoning: s.reasoning || 'Claude Haiku 4.5 Tier 2 tool-constrained high-stakes compliance recommendation.',
    }));

    return {
      suggestions,
      modelTier: ModelTier.TIER_2,
      providerName: 'ClaudeProvider (Tier 2)',
    };
  }
}
