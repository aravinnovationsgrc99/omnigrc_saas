import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';

export class TriggerImpactAnalysisDto {
  @IsOptional()
  @IsBoolean()
  includePreviousVersions?: boolean;

  @IsOptional()
  @IsString()
  specificFocusArea?: string;

  @IsOptional()
  @IsBoolean()
  forceReanalysis?: boolean;
}

export class ReviewImpactAnalysisFindingDto {
  @IsString()
  findingId: string;

  @IsEnum(['ACCEPTED', 'REJECTED', 'NEEDS_FURTHER_ANALYSIS'])
  decision: 'ACCEPTED' | 'REJECTED' | 'NEEDS_FURTHER_ANALYSIS';

  @IsOptional()
  @IsString()
  reviewNotes?: string;
}

export interface RegulatoryFindingItem {
  id: string;
  findingTitle?: string;
  sourceTextExcerpt: string;
  sourceExcerpt?: string;
  clauseReference?: string;
  changeType: 'NEW' | 'MODIFIED' | 'WITHDRAWN' | 'UNCHANGED';
  impactType?: string;
  aiInterpretation: string;
  potentialOrganizationalImpact: string;
  recommendedAction: string;
  suggestedAction?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  severity?: string;
  confidenceScore: number;
  isHumanReviewed: boolean;
  humanReviewDecision?: 'ACCEPTED' | 'REJECTED' | 'NEEDS_FURTHER_ANALYSIS';
  reviewDecision?: string;
  reviewNotes?: string;
  reviewedById?: string;
  reviewedAt?: string;
  affectedControlIds?: string[];
  affectedFunctionalAreas?: string[];
}

export interface AffectedControlImpact {
  controlId: string;
  controlCode?: string;
  controlName: string;
  impactNature: 'CONTROL_ENHANCEMENT_REQUIRED' | 'NEW_CONTROL_DEFICIENCY' | 'EXISTING_CONTROL_SUFFICIENT';
  rationale: string;
  suggestedAction: string;
}

export interface AffectedRemediationImpact {
  taskId: string;
  taskTitle: string;
  impactDescription: string;
}

export interface RegulatoryImpactAnalysisReport {
  publicationId: string;
  publicationTitle: string;
  publicationNumber?: string | null;
  regulatorCode: string;
  analyzedAt: string;
  aiProviderUsed: string;
  isFallback: boolean;
  versionComparedWith?: number | null;
  executiveSummary: string;
  overallComplianceRisk: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  findings: RegulatoryFindingItem[];
  affectedControls: AffectedControlImpact[];
  affectedRemediations: AffectedRemediationImpact[];
  humanReviewRequired: boolean;
  status: 'PENDING_HUMAN_REVIEW' | 'PARTIALLY_REVIEWED' | 'REVIEW_COMPLETED';
}

