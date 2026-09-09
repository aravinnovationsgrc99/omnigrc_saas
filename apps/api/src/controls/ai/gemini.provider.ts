import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
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

    // Structured candidate list for model
    const candidateListPrompt = candidates.map((c) => ({
      clauseId: c.id,
      frameworkCode: c.frameworkCode,
      clauseCode: c.code,
      clauseTitle: c.title,
    }));

    const systemPrompt = `
You are an expert GRC Compliance Mapping AI Assistant.
Analyze the following Security Control and map it to the MOST RELEVANT candidate clause for EACH candidate framework present in the candidate list.

STRICT RULES FOR OUTPUT:
1. You MUST ONLY pick clauseId values that exist explicitly in the Candidate List provided below. DO NOT invent or hallucinate any clauseId.
2. Provide a confidenceScore between 0.50 and 0.99 reflecting mapping accuracy.
3. Return raw JSON matching this exact structure:
{
  "suggestions": [
    {
      "clauseId": "exact_id_from_candidate_list",
      "frameworkCode": "FRAMEWORK_CODE",
      "clauseCode": "CLAUSE_CODE",
      "confidenceScore": 0.92,
      "reasoning": "Short justification"
    }
  ]
}

CONTROL TO MAP:
Name: "${controlName}"
Description: "${controlDescription}"

CANDIDATE CLAUSES LIST:
${JSON.stringify(candidateListPrompt, null, 2)}
`;

    const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(systemPrompt);
    const responseText = result.response.text();

    // Parse JSON output safely
    const cleanJsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanJsonText);

    const suggestions: SuggestedMappingItem[] = (parsed.suggestions || []).map((s: any) => ({
      clauseId: s.clauseId,
      frameworkCode: s.frameworkCode,
      clauseCode: s.clauseCode,
      confidenceScore: typeof s.confidenceScore === 'number' ? s.confidenceScore : 0.85,
      reasoning: s.reasoning || 'Gemini 1.5 Flash structured mapping recommendation.',
    }));

    return {
      suggestions,
      modelTier: ModelTier.TIER_1,
      providerName: 'GeminiProvider (Tier 1)',
    };
  }
}
