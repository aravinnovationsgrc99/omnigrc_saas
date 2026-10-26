import { RegulatorySource } from '@prisma/client';

export interface NormalizedPublicationItem {
  externalId?: string;
  canonicalUrl: string;
  title: string;
  publicationNumber?: string;
  publicationDate?: Date;
  summary?: string;
  rawContent?: string;
  contentHash: string;
  documentUrls?: string[];
  rawMetadata?: Record<string, any>;
}

export interface AdapterFetchResult {
  items: NormalizedPublicationItem[];
  diagnostics: {
    itemCount: number;
    fetchedAt: string;
    endpoint: string;
    durationMs: number;
    rawBytesSize: number;
    extra?: Record<string, any>;
  };
}

export interface RegulatorySourceAdapter {
  readonly regulatorCode: string;
  canHandle(source: RegulatorySource): boolean;
  fetchAndNormalize(source: RegulatorySource): Promise<AdapterFetchResult>;
}
