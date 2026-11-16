import { Injectable, Logger } from '@nestjs/common';
import { AiProvider, CandidateClause, AiMappingResponse, SuggestedMappingItem } from './ai-provider.interface';
import { ModelTier } from '@omnigrc/shared';

@Injectable()
export class ClaudeProvider implements AiProvider {
  private readonly logger = new Logger(ClaudeProvider.name);
  private apiKey: string | null = null;
  private model: string = 'claude-3-5-sonnet-20241022';

  constructor() {
    const key = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (key && key.trim()) {
      this.apiKey = key.trim();
      this.model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
      this.logger.log(`ClaudeProvider initialized with API key (model: ${this.model}).`);
    } else {
      this.logger.warn('ANTHROPIC_API_KEY / CLAUDE_API_KEY missing in environment. ClaudeProvider inactive (calls will fall back to Gemini).');
    }
  }

  public isAvailable(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async generateText(systemPrompt: string, userPrompt: string, timeoutMs = 45000): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Claude API key not configured.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude API request failed with HTTP ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as any;
      const textBlock = data?.content?.find((b: any) => b.type === 'text');
      const text = textBlock?.text || '';
      if (!text.trim()) {
        throw new Error('Claude API returned empty content.');
      }
      return text;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`Claude API request timed out after ${timeoutMs}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  async suggestMappings(params: {
    controlName: string;
    controlDescription: string;
    candidates: CandidateClause[];
  }): Promise<AiMappingResponse> {
    const { controlName, controlDescription, candidates } = params;

    if (!candidates || candidates.length === 0) {
      return {
        suggestions: [],
        modelTier: ModelTier.TIER_2,
        providerName: 'ClaudeProvider (Tier 2)',
      };
    }

    if (!this.apiKey) {
      throw new Error('Claude API client not initialized.');
    }

    const candidateListPrompt = candidates.map((c) => ({
      clauseId: c.id,
      frameworkCode: c.frameworkCode,
      clauseCode: c.code,
      clauseTitle: c.title,
    }));

    const systemPrompt = 'You are an authoritative GRC auditor. Output a raw JSON array of mapping suggestions with clauseId, frameworkCode, clauseCode, confidenceScore (0-1), and reasoning.';
    const userMessage = `Control Name: "${controlName}"\nControl Description: "${controlDescription}"\n\nCandidate Clauses:\n${JSON.stringify(candidateListPrompt, null, 2)}`;

    const text = await this.generateText(systemPrompt, userMessage);
    try {
      const clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const raw = JSON.parse(clean);
      const suggestions: SuggestedMappingItem[] = Array.isArray(raw)
        ? raw.map((s: any) => ({
            clauseId: s.clauseId,
            frameworkCode: s.frameworkCode,
            clauseCode: s.clauseCode,
            confidenceScore: typeof s.confidenceScore === 'number' ? s.confidenceScore : 0.9,
            reasoning: s.reasoning || 'Claude Tier 2 mapping.',
          }))
        : [];
      return {
        suggestions,
        modelTier: ModelTier.TIER_2,
        providerName: 'ClaudeProvider (Tier 2)',
      };
    } catch {
      return {
        suggestions: [],
        modelTier: ModelTier.TIER_2,
        providerName: 'ClaudeProvider (Tier 2)',
      };
    }
  }
}
