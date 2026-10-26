import { ObligationExtractorService } from './obligation-extractor.service';
import {
  ObligationExtractionMethod,
  ObligationConfidence,
  RegulatoryObligationStatus,
} from '@prisma/client';

describe('ObligationExtractorService (Candidate Regulatory Obligations)', () => {
  let service: ObligationExtractorService;

  beforeEach(() => {
    service = new ObligationExtractorService();
  });

  describe('1. Deterministic Fingerprint & Idempotency', () => {
    it('should generate identical fingerprints for identical normalized text', () => {
      const pubId = 'pub-100';
      const text1 = 'All commercial banks must implement multi-factor authentication.';
      const text2 = '  all commercial  banks must implement multi-factor authentication.  \n';

      const fp1 = service.generateFingerprint(pubId, text1, 'CL-1');
      const fp2 = service.generateFingerprint(pubId, text2, 'CL-1');

      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(64); // SHA-256 hex string
    });

    it('should generate distinct fingerprints for different clauses or publications', () => {
      const fpA = service.generateFingerprint('pub-1', 'Banks shall maintain liquidity.', 'CL-1');
      const fpB = service.generateFingerprint('pub-2', 'Banks shall maintain liquidity.', 'CL-1');
      const fpC = service.generateFingerprint('pub-1', 'Banks shall maintain liquidity.', 'CL-2');

      expect(fpA).not.toBe(fpB);
      expect(fpA).not.toBe(fpC);
    });
  });

  describe('2. Rule-Based Candidate Extraction from Text & Modals', () => {
    it('should extract candidate obligations from sentences containing mandatory modals', () => {
      const context = {
        publicationId: 'pub-rbi-01',
        publicationNumber: 'RBI/2026/01',
        title: 'Master Direction on Cyber Resilience and Digital Payment Security',
        rawText: `
          1. Introduction. The Reserve Bank of India issues these directions to enhance banking security.
          2. All Commercial Banks shall ensure that critical payment applications reside in isolated networks.
          3. Regulated Entities must report high-severity cybersecurity incidents to CERT-In within 6 hours.
          4. Background notes on historical compliance.
        `,
        canonicalUrl: 'https://www.rbi.org.in/item/100',
      };

      const candidates = service.extractCandidates(context);

      expect(candidates).toHaveLength(2);

      const [c1, c2] = candidates;

      // Candidate 1: Commercial Banks isolated networks
      expect(c1.obligationWording).toContain('All Commercial Banks shall ensure that critical payment applications');
      expect(c1.affectedActor).toBe('Commercial Banks');
      expect(c1.extractionMethod).toBe(ObligationExtractionMethod.RULE_BASED);
      expect(c1.status).toBe(RegulatoryObligationStatus.CANDIDATE);
      expect(c1.isHumanVerified).toBe(false);

      // Candidate 2: Regulated Entities 6-hour reporting
      expect(c2.obligationWording).toContain('Regulated Entities must report high-severity cybersecurity incidents');
      expect(c2.affectedActor).toBe('Regulated Entities');
      expect(c2.isHumanVerified).toBe(false);
    });

    it('should extract structured candidate obligations from pre-parsed metadata', () => {
      const context = {
        publicationId: 'pub-dpdp-01',
        title: 'Digital Personal Data Protection Guidance',
        canonicalUrl: 'https://www.meity.gov.in/dpdp',
        rawMetadata: {
          obligations: [
            {
              identifier: 'DPDP-SEC-8.1',
              title: 'Parental Consent for Minors',
              wording: 'A Data Fiduciary shall obtain verifiable consent of the parent before processing personal data of a child.',
              action: 'Obtain verifiable parental consent prior to processing minor data',
              actor: 'Data Fiduciaries',
              deadline: '2026-12-31',
            },
          ],
        },
      };

      const candidates = service.extractCandidates(context);

      expect(candidates).toHaveLength(1);
      const c = candidates[0];
      expect(c.obligationIdentifier).toBe('DPDP-SEC-8.1');
      expect(c.affectedActor).toBe('Data Fiduciaries');
      expect(c.complianceDeadline).toEqual(new Date('2026-12-31'));
      expect(c.extractionConfidence).toBe(ObligationConfidence.HIGH);
      expect(c.status).toBe(RegulatoryObligationStatus.CANDIDATE);
      expect(c.isHumanVerified).toBe(false);
    });

    it('should generate a top-level directive candidate when no sentence contains explicit modal verbs', () => {
      const context = {
        publicationId: 'pub-advisory-01',
        title: 'Advisory on Ransomware Protection Measures for Financial Entities',
        rawText: 'General overview of recent ransomware incidents observed across global financial sectors.',
        canonicalUrl: 'https://www.cert-in.org.in/advisory',
      };

      const candidates = service.extractCandidates(context);

      expect(candidates).toHaveLength(1);
      expect(candidates[0].obligationWording).toContain('Directive: Advisory on Ransomware Protection Measures');
      expect(candidates[0].status).toBe(RegulatoryObligationStatus.CANDIDATE);
      expect(candidates[0].isHumanVerified).toBe(false);
    });
  });

  describe('3. Actor & Date Resolution Safeguards', () => {
    it('should resolve recognized regulatory actors without fabricating', () => {
      expect(service.resolveActor('Data Fiduciaries must implement encryption.')).toBe('Data Fiduciaries');
      expect(service.resolveActor('Non-Banking Financial Companies (NBFCs) shall audit APIs.')).toBe('Non-Banking Financial Companies (NBFCs)');
      expect(service.resolveActor('General public notice.')).toBeUndefined();
    });

    it('should parse explicit ISO dates and return undefined when no date is declared', () => {
      expect(service.extractDeadlineDate('Entities must complete remediation by 2026-12-31.')).toEqual(
        new Date('2026-12-31'),
      );
      expect(service.extractDeadlineDate('Entities must complete remediation as soon as possible.')).toBeUndefined();
    });
  });
});
