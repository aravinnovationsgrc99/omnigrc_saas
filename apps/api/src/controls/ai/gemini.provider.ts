import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { AiProvider, CandidateClause, AiMappingResponse, SuggestedMappingItem } from './ai-provider.interface';
import { ModelTier } from '@omnigrc/shared';

@Injectable()
export class GeminiProvider implements AiProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private genAI: GoogleGenerativeAI | null = null;
  private circuitBreaker = {
    isOpen: false,
    trippedAt: 0,
    consecutiveFailures: 0,
    cooldownMs: 5 * 60 * 1000, // 5 minute cooldown
    lastError: '',
    lastStatus: 0,
  };

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey.trim()) {
      this.genAI = new GoogleGenerativeAI(apiKey.trim());
      this.logger.log('GeminiProvider initialized with GEMINI_API_KEY.');
    } else {
      this.logger.warn('GEMINI_API_KEY missing in environment.');
    }
  }

  public isAvailable(): boolean {
    if (!this.genAI) return false;
    if (this.circuitBreaker.isOpen) {
      if (Date.now() - this.circuitBreaker.trippedAt > this.circuitBreaker.cooldownMs) {
        // Half-open state: allow a single trial attempt
        return true;
      }
      return false;
    }
    return true;
  }

  public isCircuitOpen(): boolean {
    if (!this.circuitBreaker.isOpen) return false;
    return Date.now() - this.circuitBreaker.trippedAt <= this.circuitBreaker.cooldownMs;
  }

  public getCircuitStatus() {
    return {
      isOpen: this.isCircuitOpen(),
      lastStatus: this.circuitBreaker.lastStatus,
      lastError: this.circuitBreaker.lastError,
      consecutiveFailures: this.circuitBreaker.consecutiveFailures,
      cooldownRemainingMs: Math.max(0, this.circuitBreaker.cooldownMs - (Date.now() - this.circuitBreaker.trippedAt)),
    };
  }

  public recordSuccess() {
    this.circuitBreaker.isOpen = false;
    this.circuitBreaker.consecutiveFailures = 0;
    this.circuitBreaker.lastError = '';
    this.circuitBreaker.lastStatus = 0;
  }

  public recordFailure(err: any) {
    const msg = String(err?.message || err || '');
    this.circuitBreaker.consecutiveFailures += 1;
    this.circuitBreaker.lastError = msg;

    if (
      msg.includes('403') ||
      msg.includes('free tier') ||
      msg.includes('billing') ||
      msg.includes('quota') ||
      msg.includes('Forbidden')
    ) {
      this.circuitBreaker.isOpen = true;
      this.circuitBreaker.trippedAt = Date.now();
      this.circuitBreaker.lastStatus = 403;
      this.logger.warn(
        `GeminiProvider circuit breaker tripped: 403 Forbidden (Billing/Free Tier restriction). Cooling down for ${this.circuitBreaker.cooldownMs / 1000}s.`
      );
    } else if (msg.includes('401') || msg.includes('API key') || msg.includes('credential')) {
      this.circuitBreaker.isOpen = true;
      this.circuitBreaker.trippedAt = Date.now();
      this.circuitBreaker.lastStatus = 401;
      this.logger.warn(`GeminiProvider circuit breaker tripped: 401 Unauthorized (Invalid API key).`);
    } else if (this.circuitBreaker.consecutiveFailures >= 3) {
      this.circuitBreaker.isOpen = true;
      this.circuitBreaker.trippedAt = Date.now();
      this.circuitBreaker.lastStatus = 500;
      this.logger.warn(`GeminiProvider circuit breaker tripped: ${this.circuitBreaker.consecutiveFailures} consecutive failures.`);
    }
  }

  public resetCircuit() {
    this.recordSuccess();
  }

  private resolveModelName(): string {
    const configured = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    // Protect against unsupported/unbilled legacy model identifiers
    if (configured === 'gemini-pro-latest' || configured.includes('pro-latest')) {
      return 'gemini-1.5-flash';
    }
    return configured;
  }

  async generateText(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!this.genAI) {
      throw new Error('Gemini API client not initialized.');
    }
    if (this.isCircuitOpen()) {
      throw new Error(`GeminiProvider circuit breaker is OPEN (${this.circuitBreaker.lastError || '403 Forbidden'})`);
    }

    const modelName = this.resolveModelName();
    const model = this.genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt,
    });

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API request timed out after 8000ms')), 8000)
      );
      const contentPromise = model.generateContent(userPrompt);
      const result = await Promise.race([contentPromise, timeoutPromise]);
      this.recordSuccess();
      return result.response.text();
    } catch (err: any) {
      this.recordFailure(err);
      throw err;
    }
  }

  async suggestMappings(params: {
    controlName: string;
    controlDescription: string;
    candidates: CandidateClause[];
  }): Promise<AiMappingResponse> {
    const { controlName, controlDescription, candidates } = params;

    // GUARD: If candidate list is empty, skip external API call
    if (!candidates || candidates.length === 0) {
      this.logger.warn('Candidate clause list is empty — skipping Gemini API call.');
      return {
        suggestions: [],
        modelTier: ModelTier.TIER_1,
        providerName: 'GeminiProvider (Tier 1)',
      };
    }

    if (!this.genAI) {
      throw new Error('Gemini API client not initialized.');
    }

    const candidateIds = candidates.map((c) => c.id);

    const candidateListPrompt = candidates.map((c) => ({
      clauseId: c.id,
      frameworkCode: c.frameworkCode,
      clauseCode: c.code,
      clauseTitle: c.title,
    }));

    const systemPrompt = `You are an expert GRC Compliance Mapping AI Assistant.
Analyze the following Security Control and map it to the MOST RELEVANT candidate clause for EACH candidate framework present in the candidate list.

CONTROL TO MAP:
Name: "${controlName}"
Description: "${controlDescription}"

CANDIDATE CLAUSES LIST:
${JSON.stringify(candidateListPrompt, null, 2)}`;

    // Constrain Gemini using native responseSchema and enum tool constraints
    const modelName = this.resolveModelName();
    const model = this.genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            suggestions: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  clauseId: {
                    type: SchemaType.STRING,
                    format: 'enum',
                    enum: candidateIds,
                    description: 'The exact candidate clause ID selected from candidates',
                  },
                  frameworkCode: { type: SchemaType.STRING },
                  clauseCode: { type: SchemaType.STRING },
                  confidenceScore: { type: SchemaType.NUMBER },
                  reasoning: { type: SchemaType.STRING },
                },
                required: ['clauseId', 'frameworkCode', 'clauseCode', 'confidenceScore', 'reasoning'],
              },
            },
          },
          required: ['suggestions'],
        },
      },
    });

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API mapping request timed out after 10000ms')), 10000)
      );
      const contentPromise = model.generateContent(systemPrompt);
      const result = await Promise.race([contentPromise, timeoutPromise]);
      this.recordSuccess();

      const responseText = result.response.text();
      const cleanJsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleanJsonText);

      const suggestions: SuggestedMappingItem[] = (parsed.suggestions || []).map((s: any) => ({
        clauseId: s.clauseId,
        frameworkCode: s.frameworkCode,
        clauseCode: s.clauseCode,
        confidenceScore: typeof s.confidenceScore === 'number' ? s.confidenceScore : 0.85,
        reasoning: s.reasoning || `Gemini (${modelName}) structured mapping recommendation.`,
      }));

      return {
        suggestions,
        modelTier: ModelTier.TIER_1,
        providerName: `GeminiProvider (${modelName})`,
      };
    } catch (err: any) {
      this.recordFailure(err);
      throw err;
    }
  }
}
