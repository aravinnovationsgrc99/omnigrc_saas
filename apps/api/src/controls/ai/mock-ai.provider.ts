import { Injectable, Logger } from '@nestjs/common';
import { AiProvider, CandidateClause, AiMappingResponse, SuggestedMappingItem } from './ai-provider.interface';
import { ModelTier } from '@omnigrc/shared';

@Injectable()
export class MockAiProvider implements AiProvider {
  private readonly logger = new Logger(MockAiProvider.name);

  constructor() {
    this.logger.warn('Running in Mock AI Provider mode — Returning deterministic mapping suggestions with zero external API cost.');
  }

  async suggestMappings(params: {
    controlName: string;
    controlDescription: string;
    candidates: CandidateClause[];
  }): Promise<AiMappingResponse> {
    const { controlName, controlDescription, candidates } = params;
    const combinedText = `${controlName} ${controlDescription}`.toLowerCase();

    // Group candidate clauses by framework
    const groupedByFw = new Map<string, CandidateClause[]>();
    for (const c of candidates) {
      const list = groupedByFw.get(c.frameworkCode) || [];
      list.push(c);
      groupedByFw.set(c.frameworkCode, list);
    }

    const suggestions: SuggestedMappingItem[] = [];

    // For each candidate framework, pick the candidate clause that best matches keywords or pick the first candidate
    for (const [fwCode, clauseList] of groupedByFw.entries()) {
      if (clauseList.length === 0) continue;

      let bestMatch = clauseList[0];
      let maxScore = 0.70;

      for (const clause of clauseList) {
        const clauseText = `${clause.code} ${clause.title}`.toLowerCase();
        let score = 0.65;

        // Keyword similarity heuristic
        if (combinedText.includes('encrypt') && (clauseText.includes('cryptography') || clauseText.includes('encryption') || clauseText.includes('transit') || clauseText.includes('32') || clauseText.includes('8.24'))) {
          score = 0.94;
        } else if (combinedText.includes('access') && (clauseText.includes('access') || clauseText.includes('6.1') || clauseText.includes('15'))) {
          score = 0.92;
        } else if (combinedText.includes('backup') && (clauseText.includes('continuity') || clauseText.includes('7.2') || clauseText.includes('7'))) {
          score = 0.88;
        } else if (combinedText.includes('ai') && (clauseText.includes('ai') || clauseText.includes('8.2') || clauseText.includes('35'))) {
          score = 0.96;
        } else if (combinedText.includes('audit') && (clauseText.includes('log') || clauseText.includes('monitor') || clauseText.includes('b'))) {
          score = 0.91;
        } else if (combinedText.includes('vendor') && (clauseText.includes('supplier') || clauseText.includes('vendor') || clauseText.includes('9.2'))) {
          score = 0.89;
        } else if (combinedText.includes('breach') && (clauseText.includes('breach') || clauseText.includes('incident') || clauseText.includes('33'))) {
          score = 0.95;
        } else if (combinedText.includes('endpoint') && (clauseText.includes('device') || clauseText.includes('endpoint') || clauseText.includes('8.1'))) {
          score = 0.93;
        }

        if (score > maxScore) {
          maxScore = score;
          bestMatch = clause;
        }
      }

      suggestions.push({
        clauseId: bestMatch.id,
        frameworkCode: fwCode,
        clauseCode: bestMatch.code,
        confidenceScore: parseFloat(maxScore.toFixed(2)),
        reasoning: `Deterministic match for control "${controlName}" against candidate ${bestMatch.code} (${bestMatch.title}).`,
      });
    }

    return {
      suggestions,
      modelTier: ModelTier.TIER_1,
      providerName: 'MockAiProvider',
    };
  }
}
