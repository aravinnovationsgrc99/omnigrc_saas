/**
 * Synthetic Demo Data for Regulatory Intelligence (Meridian Health Pvt. Ltd.)
 */

export function getRegulatoryDemoData(endpoint: string): any {
  const clean = endpoint.split('?')[0];

  if (clean === '/regulatory/sources') {
    return {
      total: 4,
      items: [
        {
          id: 'src-rbi',
          regulatorCode: 'RBI',
          displayName: 'Reserve Bank of India — Master Directions on Cyber & IT Governance',
          isEnabled: true,
          healthStatus: 'HEALTHY',
          consecutiveFailures: 0,
          lastSuccessfulFetchAt: '2026-10-28T10:15:00Z',
          nextScheduledFetchAt: '2026-10-29T10:15:00Z',
          configuredEndpoint: 'https://rbi.org.in/scripts/BS_CircularsDisplay.aspx',
          catalogueEntry: { code: 'RBI_CYBER_2024', displayName: 'RBI IT & Cyber Risk Directives', jurisdiction: 'India' },
          _count: { publications: 4 },
        },
        {
          id: 'src-dpdp',
          regulatorCode: 'DPDP',
          displayName: 'Data Protection Board of India — Digital Personal Data Protection Rules',
          isEnabled: true,
          healthStatus: 'HEALTHY',
          consecutiveFailures: 0,
          lastSuccessfulFetchAt: '2026-10-28T08:30:00Z',
          nextScheduledFetchAt: '2026-10-29T08:30:00Z',
          configuredEndpoint: 'https://meity.gov.in/content/dpdp-rules-2023',
          catalogueEntry: { code: 'DPDP_2023', displayName: 'Digital Personal Data Protection Act', jurisdiction: 'India' },
          _count: { publications: 3 },
        },
        {
          id: 'src-certin',
          regulatorCode: 'CERT-In',
          displayName: 'Indian Computer Emergency Response Team — 6-Hour Cybersecurity Directives',
          isEnabled: true,
          healthStatus: 'HEALTHY',
          consecutiveFailures: 0,
          lastSuccessfulFetchAt: '2026-10-28T11:00:00Z',
          nextScheduledFetchAt: '2026-10-29T11:00:00Z',
          configuredEndpoint: 'https://cert-in.org.in/directives/cybersecurity-reporting',
          catalogueEntry: { code: 'CERT_IN_DIR', displayName: 'CERT-In Mandatory Reporting', jurisdiction: 'India' },
          _count: { publications: 2 },
        },
        {
          id: 'src-hipaa',
          regulatorCode: 'HHS-OCR',
          displayName: 'US Health & Human Services OCR — HIPAA Security & Breach Notification Rules',
          isEnabled: true,
          healthStatus: 'HEALTHY',
          consecutiveFailures: 0,
          lastSuccessfulFetchAt: '2026-10-27T18:00:00Z',
          nextScheduledFetchAt: '2026-10-28T18:00:00Z',
          configuredEndpoint: 'https://hhs.gov/hipaa/for-professionals/security/laws-regulations',
          catalogueEntry: { code: 'HIPAA_HHS', displayName: 'HIPAA Security Safeguards', jurisdiction: 'United States' },
          _count: { publications: 3 },
        },
      ],
    };
  }

  if (clean.includes('/regulatory/sources/') && clean.endsWith('/sync')) {
    return { success: true, message: 'Source sync completed successfully.' };
  }

  if (clean === '/regulatory/catalogue') {
    return {
      total: 4,
      items: [
        {
          id: 'cat-dpdp',
          code: 'DPDP_2023',
          displayName: 'Digital Personal Data Protection Act 2023',
          jurisdiction: 'India',
          issuingAuthority: 'Ministry of Electronics & Information Technology (MeitY)',
          instrumentType: 'Statutory Act',
          verificationStatus: 'VERIFIED',
          connectorStatus: 'ACTIVE',
          ingestionMethod: 'AUTOMATED_CONNECTOR',
          _count: { sources: 1, publications: 3, manualIntakes: 0 },
        },
        {
          id: 'cat-rbi',
          code: 'RBI_IT_GOV',
          displayName: 'Master Direction – Information Technology Governance and Controls',
          jurisdiction: 'India',
          issuingAuthority: 'Reserve Bank of India',
          instrumentType: 'Regulatory Direction',
          verificationStatus: 'VERIFIED',
          connectorStatus: 'ACTIVE',
          ingestionMethod: 'AUTOMATED_CONNECTOR',
          _count: { sources: 1, publications: 4, manualIntakes: 0 },
        },
        {
          id: 'cat-certin',
          code: 'CERT_IN_DIR',
          displayName: 'CERT-In Cyber Incident Reporting Directives 2022',
          jurisdiction: 'India',
          issuingAuthority: 'CERT-In',
          instrumentType: 'Statutory Directive',
          verificationStatus: 'VERIFIED',
          connectorStatus: 'ACTIVE',
          ingestionMethod: 'AUTOMATED_CONNECTOR',
          _count: { sources: 1, publications: 2, manualIntakes: 0 },
        },
        {
          id: 'cat-hipaa',
          code: 'HIPAA_SECURITY',
          displayName: 'HIPAA Security Rule (45 CFR Part 160 & Part 164 Subparts A and C)',
          jurisdiction: 'United States',
          issuingAuthority: 'Department of Health & Human Services',
          instrumentType: 'Federal Regulation',
          verificationStatus: 'VERIFIED',
          connectorStatus: 'ACTIVE',
          ingestionMethod: 'AUTOMATED_CONNECTOR',
          _count: { sources: 1, publications: 3, manualIntakes: 0 },
        },
      ],
    };
  }

  if (clean === '/regulatory/publications') {
    return {
      total: 4,
      items: [
        {
          id: 'pub-1',
          title: 'Master Direction – Information Technology Governance, Risk, Controls and Assurance Practices 2023',
          publicationNumber: 'RBI/2023-24/107',
          publicationDate: '2023-11-07',
          processingState: 'PROCESSED',
          currentVersionNumber: 1,
          isDocumentBytesVerified: true,
          source: { regulatorCode: 'RBI', displayName: 'Reserve Bank of India' },
          catalogueEntry: { code: 'RBI_IT_GOV', displayName: 'RBI IT Governance', jurisdiction: 'India' },
          externalId: 'RBI_DIR_107',
          canonicalUrl: 'https://rbi.org.in/scripts/BS_CircularsDisplay.aspx?Id=12562',
        },
        {
          id: 'pub-2',
          title: 'Directives on Information Security Practices, Procedure, Prevention, and Response to Cyber Incidents',
          publicationNumber: 'CERT-In/DIR/2022/20',
          publicationDate: '2022-04-28',
          processingState: 'PROCESSED',
          currentVersionNumber: 1,
          isDocumentBytesVerified: true,
          source: { regulatorCode: 'CERT-In', displayName: 'CERT-In' },
          catalogueEntry: { code: 'CERT_IN_DIR', displayName: 'CERT-In Mandatory Reporting', jurisdiction: 'India' },
          externalId: 'CERT_DIR_2022',
          canonicalUrl: 'https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf',
        },
        {
          id: 'pub-3',
          title: 'Digital Personal Data Protection Act Notification & Data Fiduciary Compliance Standards',
          publicationNumber: 'DPDPA/NOTIF/2023/01',
          publicationDate: '2023-08-11',
          processingState: 'PROCESSED',
          currentVersionNumber: 1,
          isDocumentBytesVerified: true,
          source: { regulatorCode: 'DPDP', displayName: 'Data Protection Board of India' },
          catalogueEntry: { code: 'DPDP_2023', displayName: 'Digital Personal Data Protection Act', jurisdiction: 'India' },
          externalId: 'DPDP_ACT_2023',
          canonicalUrl: 'https://meity.gov.in/content/digital-personal-data-protection-act-2023',
        },
        {
          id: 'pub-4',
          title: 'HIPAA Security Rule Safeguards for Electronic Protected Health Information (ePHI)',
          publicationNumber: '45-CFR-164.312',
          publicationDate: '2024-01-15',
          processingState: 'PROCESSED',
          currentVersionNumber: 2,
          isDocumentBytesVerified: true,
          source: { regulatorCode: 'HHS-OCR', displayName: 'HHS Office for Civil Rights' },
          catalogueEntry: { code: 'HIPAA_SECURITY', displayName: 'HIPAA Security Safeguards', jurisdiction: 'United States' },
          externalId: 'HHS_HIPAA_2024',
          canonicalUrl: 'https://www.hhs.gov/hipaa/for-professionals/security/index.html',
        },
      ],
    };
  }

  if (clean === '/regulatory/obligations') {
    return {
      total: 4,
      items: [
        {
          id: 'ob-1',
          title: 'Mandatory 6-Hour Cyber Incident Reporting to CERT-In and Board Notification',
          status: 'ACTIVE',
          obligationType: 'MANDATORY_DIRECTIVE',
          jurisdiction: 'India',
          affectedActor: 'Licensed Healthcare & Digital Fiduciary Entities',
          isHumanReviewed: true,
          extractionMethod: 'AI_LLM_STRUCTURED_EXTRACTION',
          complianceDeadline: '2026-12-31',
        },
        {
          id: 'ob-2',
          title: 'End-to-End Cryptographic Encryption (TLS 1.3 & AES-256) for Patient Health Data',
          status: 'ACTIVE',
          obligationType: 'TECHNICAL_SAFEGUARD',
          jurisdiction: 'United States / India',
          affectedActor: 'Covered Entities & Business Associates (ePHI Processors)',
          isHumanReviewed: true,
          extractionMethod: 'AI_LLM_STRUCTURED_EXTRACTION',
          complianceDeadline: '2026-11-30',
        },
        {
          id: 'ob-3',
          title: 'Data Principal Consent Management & Purpose-Limited Processing Audit Logs',
          status: 'ACTIVE',
          obligationType: 'DATA_PRIVACY_RULE',
          jurisdiction: 'India',
          affectedActor: 'Significant Data Fiduciaries (Health Platforms)',
          isHumanReviewed: true,
          extractionMethod: 'AI_LLM_STRUCTURED_EXTRACTION',
          complianceDeadline: '2026-12-15',
        },
        {
          id: 'ob-4',
          title: 'Bi-Annual Independent Vulnerability Assessment & Penetration Testing (VAPT)',
          status: 'ACTIVE',
          obligationType: 'ASSURANCE_AUDIT',
          jurisdiction: 'India',
          affectedActor: 'Digital Healthcare Infrastructure Providers',
          isHumanReviewed: true,
          extractionMethod: 'AI_LLM_STRUCTURED_EXTRACTION',
          complianceDeadline: '2026-10-31',
        },
      ],
    };
  }

  if (clean.includes('/regulatory/obligations/') && clean.endsWith('/review')) {
    return { success: true, message: 'Obligation marked reviewed.' };
  }

  if (clean === '/regulatory/applicability') {
    return {
      total: 4,
      items: [
        {
          id: 'app-1',
          outcome: 'APPLICABLE',
          confidence: 'HIGH (96.4%)',
          determinationType: 'SYSTEM_EVALUATED_AND_APPROVED',
          isHumanReviewed: true,
          rationale: 'Meridian Health Pvt. Ltd. processes electronic health records (ePHI) of over 250,000 patient subjects within India and partnered US telemedicine networks.',
          obligationId: 'ob-1',
        },
        {
          id: 'app-2',
          outcome: 'APPLICABLE',
          confidence: 'HIGH (98.2%)',
          determinationType: 'SYSTEM_EVALUATED_AND_APPROVED',
          isHumanReviewed: true,
          rationale: 'PostgreSQL database clusters and cloud gateways handle sensitive diagnostic data requiring mandatory in-transit TLS 1.3 encryption.',
          obligationId: 'ob-2',
        },
        {
          id: 'app-3',
          outcome: 'APPLICABLE',
          confidence: 'HIGH (94.0%)',
          determinationType: 'SYSTEM_EVALUATED_AND_APPROVED',
          isHumanReviewed: true,
          rationale: 'Designated as a Significant Data Fiduciary under DPDPA Section 10 for processing critical health biometric telemetry.',
          obligationId: 'ob-3',
        },
        {
          id: 'app-4',
          outcome: 'APPLICABLE',
          confidence: 'HIGH (95.5%)',
          determinationType: 'SYSTEM_EVALUATED_AND_APPROVED',
          isHumanReviewed: true,
          rationale: 'API gateways and telemetry endpoints require semi-annual third-party security audits under RBI/CERT-In guidelines.',
          obligationId: 'ob-4',
        },
      ],
    };
  }

  if (clean === '/regulatory/gaps') {
    return {
      total: 2,
      items: [
        {
          id: 'gap-1',
          gapOutcome: 'GAP_IDENTIFIED',
          evidenceOutcome: 'INSUFFICIENT',
          isHumanReviewed: true,
          obligationId: 'ob-1',
          controlId: 'ctrl-tls-13',
          riskScore: 16,
        },
        {
          id: 'gap-2',
          gapOutcome: 'REQUIRES_REVIEW',
          evidenceOutcome: 'PARTIALLY_IMPLEMENTED',
          isHumanReviewed: false,
          obligationId: 'ob-3',
          controlId: 'ctrl-consent-audit',
          riskScore: 12,
        },
      ],
    };
  }

  if (clean === '/regulatory/gaps/summary') {
    return {
      total: 2,
      high: 1,
      medium: 1,
      low: 0,
    };
  }

  if (clean === '/regulatory/remediation') {
    return {
      total: 2,
      items: [
        {
          id: 'rem-1',
          title: 'Automate CERT-In 6-Hour Cyber Incident Escalation Webhook Integration',
          status: 'IN_PROGRESS',
          priority: 'HIGH',
          targetDate: '2026-11-15',
          legalDeadline: '2026-12-31',
          isHumanApproved: true,
          assessmentId: 'gap-1',
        },
        {
          id: 'rem-2',
          title: 'Deploy Patient Consent Revocation Portal for DPDPA Compliance',
          status: 'UNDER_REVIEW',
          priority: 'MEDIUM',
          targetDate: '2026-11-30',
          legalDeadline: '2026-12-15',
          isHumanApproved: true,
          assessmentId: 'gap-2',
        },
      ],
    };
  }

  if (clean === '/regulatory/remediation/summary') {
    return {
      totalOpen: 2,
      overdue: 0,
      pendingReview: 1,
      inProgress: 1,
    };
  }

  return { total: 0, items: [] };
}

