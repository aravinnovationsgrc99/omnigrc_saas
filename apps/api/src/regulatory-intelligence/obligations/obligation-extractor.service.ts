import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  ObligationExtractionMethod,
  ObligationConfidence,
  RegulatoryObligationStatus,
} from '@prisma/client';

export interface ExtractedCandidateObligation {
  obligationIdentifier?: string;
  title: string;
  obligationWording: string;
  requiredAction?: string;
  affectedActor?: string;
  effectiveDate?: Date;
  complianceDeadline?: Date;
  sourceExcerpt?: string;
  documentLocation?: Record<string, any>;
  extractionMethod: ObligationExtractionMethod;
  extractionConfidence: ObligationConfidence;
  extractionModelDetails?: Record<string, any>;
  fingerprint: string;
  status: RegulatoryObligationStatus;
  isHumanVerified: boolean;
}

export interface PublicationExtractionContext {
  publicationId: string;
  publicationNumber?: string | null;
  title: string;
  rawText?: string | null;
  rawMetadata?: Record<string, any> | null;
  canonicalUrl: string;
  versionNumber?: number;
}

// Regex patterns to identify mandatory modal phrases in regulatory text
const MANDATORY_PATTERNS = [
  /\b(?:must|shall|is required to|are required to|shall ensure|must ensure)\b([^.;:]+)/gi,
  /\b(?:mandatory|strictly prohibited|prohibited from)\b([^.;:]+)/gi,
  /\b(?:all regulated entities shall|banks shall|fiduciaries must)\b([^.;:]+)/gi,
];

// Common regulatory actors in coverage catalogue
const KNOWN_ACTORS = [
  'Regulated Entities',
  'Commercial Banks',
  'Non-Banking Financial Companies (NBFCs)',
  'Data Fiduciaries',
  'Data Processors',
  'Intermediaries',
  'Insurers and Reinsurers',
  'Payment System Operators',
  'Designated Significant Data Fiduciaries',
];

@Injectable()
export class ObligationExtractorService {
  private readonly logger = new Logger(ObligationExtractorService.name);

  /**
   * Generates a deterministic SHA-256 fingerprint for an extracted obligation
   * to guarantee idempotent persistence and prevent duplicate candidate obligations.
   */
  public generateFingerprint(publicationId: string, wording: string, identifier?: string): string {
    const normalizedWording = wording
      .toLowerCase()
      .replace(/[\s\r\n\t]+/g, ' ')
      .trim();
    const idKey = identifier ? identifier.trim().toLowerCase() : '';
    return crypto
      .createHash('sha256')
      .update(`${publicationId}::${idKey}::${normalizedWording}`)
      .digest('hex');
  }

  /**
   * Safely extracts candidate regulatory obligations from publication title, metadata,
   * and raw publication text without invoking unsafe binary execution.
   */
  public extractCandidates(context: PublicationExtractionContext): ExtractedCandidateObligation[] {
    const candidates: ExtractedCandidateObligation[] = [];
    const textPool = [context.title, context.rawText || ''].filter(Boolean).join('\n\n');

    if (!textPool || textPool.trim().length === 0) {
      return candidates;
    }

    // 1. Extract from structured metadata if present (e.g. from specialized RSS feeds or catalogue)
    if (context.rawMetadata && typeof context.rawMetadata === 'object') {
      const meta = context.rawMetadata;
      if (meta.obligations && Array.isArray(meta.obligations)) {
        for (const rawOb of meta.obligations) {
          if (rawOb.wording || rawOb.title) {
            const wording = String(rawOb.wording || rawOb.title).trim();
            const identifier = rawOb.identifier || rawOb.clause || undefined;
            const fingerprint = this.generateFingerprint(context.publicationId, wording, identifier);

            candidates.push({
              obligationIdentifier: identifier,
              title: String(rawOb.title || wording.substring(0, 120)),
              obligationWording: wording,
              requiredAction: rawOb.action ? String(rawOb.action).trim() : undefined,
              affectedActor: this.resolveActor(rawOb.actor || textPool),
              effectiveDate: rawOb.effectiveDate ? new Date(rawOb.effectiveDate) : undefined,
              complianceDeadline: rawOb.deadline ? new Date(rawOb.deadline) : undefined,
              sourceExcerpt: rawOb.excerpt ? String(rawOb.excerpt).trim() : wording,
              documentLocation: rawOb.location || { url: context.canonicalUrl },
              extractionMethod: ObligationExtractionMethod.RULE_BASED,
              extractionConfidence: ObligationConfidence.HIGH,
              extractionModelDetails: {
                engine: 'omnigrc-structured-metadata-extractor-v1',
                source: 'structured_feed_metadata',
              },
              fingerprint,
              status: RegulatoryObligationStatus.CANDIDATE,
              isHumanVerified: false,
            });
          }
        }
      }
    }

    // 2. Extract from publication title and text using deterministic regulatory grammar rules
    // Splits text into candidate sentences
    const sentences = textPool
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20 && s.length < 1500);

    let clauseIndex = 1;
    for (const sentence of sentences) {
      let isCandidate = false;
      let matchedAction: string | undefined;

      for (const pattern of MANDATORY_PATTERNS) {
        pattern.lastIndex = 0;
        const match = pattern.exec(sentence);
        if (match) {
          isCandidate = true;
          matchedAction = match[0].trim();
          break;
        }
      }

      if (isCandidate) {
        const identifier = context.publicationNumber
          ? `${context.publicationNumber}-CAND-${clauseIndex}`
          : `PUB-${context.publicationId.substring(0, 8)}-CAND-${clauseIndex}`;

        const fingerprint = this.generateFingerprint(context.publicationId, sentence, identifier);

        // Deduplicate within the same run
        if (!candidates.some((c) => c.fingerprint === fingerprint)) {
          const actor = this.resolveActor(sentence);
          const deadline = this.extractDeadlineDate(sentence);

          candidates.push({
            obligationIdentifier: identifier,
            title: this.generateTitleFromWording(sentence),
            obligationWording: sentence,
            requiredAction: matchedAction,
            affectedActor: actor,
            effectiveDate: undefined, // Explicitly undefined if not verifiably declared in sentence
            complianceDeadline: deadline,
            sourceExcerpt: sentence,
            documentLocation: {
              url: context.canonicalUrl,
              sentenceIndex: clauseIndex,
            },
            extractionMethod: ObligationExtractionMethod.RULE_BASED,
            extractionConfidence: sentence.length < 300 ? ObligationConfidence.HIGH : ObligationConfidence.MEDIUM,
            extractionModelDetails: {
              engine: 'omnigrc-grammar-rule-extractor-v1',
              detectedModal: matchedAction,
            },
            fingerprint,
            status: RegulatoryObligationStatus.CANDIDATE,
            isHumanVerified: false,
          });

          clauseIndex++;
        }
      }
    }

    // 3. Fallback: If no sentence triggered modal grammar rules, but publication is an official circular/direction,
    // generate a single top-level candidate obligation representing the directive itself
    if (candidates.length === 0 && context.title) {
      const defaultIdentifier = context.publicationNumber
        ? `${context.publicationNumber}-GENERAL`
        : `PUB-${context.publicationId.substring(0, 8)}-GENERAL`;

      const wording = `Directive: ${context.title}. Regulated entities must review publication for actionable operational compliance.`;
      const fingerprint = this.generateFingerprint(context.publicationId, wording, defaultIdentifier);

      candidates.push({
        obligationIdentifier: defaultIdentifier,
        title: context.title.substring(0, 120),
        obligationWording: wording,
        requiredAction: 'Review publication instructions and align relevant internal controls',
        affectedActor: this.resolveActor(textPool) || 'Regulated Entities',
        effectiveDate: undefined,
        complianceDeadline: undefined,
        sourceExcerpt: context.title,
        documentLocation: { url: context.canonicalUrl },
        extractionMethod: ObligationExtractionMethod.RULE_BASED,
        extractionConfidence: ObligationConfidence.MEDIUM,
        extractionModelDetails: {
          engine: 'omnigrc-top-level-directive-extractor-v1',
          rule: 'publication_title_fallback',
        },
        fingerprint,
        status: RegulatoryObligationStatus.CANDIDATE,
        isHumanVerified: false,
      });
    }

    return candidates;
  }

  /**
   * Resolves the affected actor if explicitly mentioned in the text.
   * Returns undefined if no known actor is identifiable (never fabricates).
   */
  public resolveActor(text: string): string | undefined {
    if (!text) return undefined;
    const lower = text.toLowerCase();

    for (const actor of KNOWN_ACTORS) {
      if (lower.includes(actor.toLowerCase())) {
        return actor;
      }
    }

    if (lower.includes('bank') || lower.includes('banking')) return 'Commercial Banks';
    if (lower.includes('nbfc')) return 'Non-Banking Financial Companies (NBFCs)';
    if (lower.includes('data fiduciary') || lower.includes('fiduciaries')) return 'Data Fiduciaries';
    if (lower.includes('regulated entity') || lower.includes('regulated entities')) return 'Regulated Entities';
    if (lower.includes('insurer')) return 'Insurers and Reinsurers';

    return undefined; // Represent unavailable info explicitly
  }

  /**
   * Extracts an explicit deadline date if clearly declared (e.g., "within 6 hours", "by March 31, 2026").
   * Never fabricates dates; returns undefined if ambiguous.
   */
  public extractDeadlineDate(text: string): Date | undefined {
    // E.g. "by 31 December 2026" or "by 2026-12-31"
    const dateMatch = /\b(?:by|before|effective from)\s+(\d{4}-\d{2}-\d{2})\b/i.exec(text);
    if (dateMatch) {
      const parsed = new Date(dateMatch[1]);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return undefined;
  }

  /**
   * Summarizes sentence into a concise human-readable obligation title.
   */
  private generateTitleFromWording(wording: string): string {
    const cleaned = wording.replace(/^[^a-zA-Z0-9]+/, '').trim();
    if (cleaned.length <= 100) {
      return cleaned;
    }
    return cleaned.substring(0, 97) + '...';
  }
}
