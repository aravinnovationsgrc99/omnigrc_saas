import { ModelTier } from '@omnigrc/shared';

export interface CandidateClause {
  id: string;
  frameworkCode: string;
  code: string;
  title: string;
}

export interface SuggestedMappingItem {
  clauseId: string;
  frameworkCode: string;
  clauseCode: string;
  confidenceScore: number;
  reasoning?: string;
}

export interface AiMappingResponse {
  suggestions: SuggestedMappingItem[];
  modelTier: ModelTier;
  providerName: string;
}

export interface AiProvider {
  suggestMappings(params: {
    controlName: string;
    controlDescription: string;
    candidates: CandidateClause[];
  }): Promise<AiMappingResponse>;
}
