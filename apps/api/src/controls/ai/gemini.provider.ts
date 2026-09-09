import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { AiProvider, CandidateClause, AiMappingResponse, SuggestedMappingItem } from './ai-provider.interface';
import { ModelTier } from '@omnigrc/shared';

@Injectable()
export class GeminiProvider implements AiProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private genAI: GoogleGenerativeAI | null = null;

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
    return Boolean(this.genAI);
  }

  async suggestMappings(params: {
    controlName: string;
    controlDescription: string;
    candidates: CandidateClause[];
  }): Promise<AiMappingResponse> {
    if (!this.genAI) {
      throw new Error('Gemini API client not initialized.');
    }

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
    const model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
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

    const result = await model.generateContent(systemPrompt);
    const responseText = result.response.text();
    const cleanJsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanJsonText);

    const suggestions: SuggestedMappingItem[] = (parsed.suggestions || []).map((s: any) => ({
      clauseId: s.clauseId,
      frameworkCode: s.frameworkCode,
      clauseCode: s.clauseCode,
      confidenceScore: typeof s.confidenceScore === 'number' ? s.confidenceScore : 0.85,
      reasoning: s.reasoning || 'Gemini 2.5 Flash-Lite structured mapping recommendation.',
    }));

    return {
      suggestions,
      modelTier: ModelTier.TIER_1,
      providerName: 'GeminiProvider (Tier 1)',
    };
  }
}
