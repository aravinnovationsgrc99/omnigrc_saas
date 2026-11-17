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

  if (clean.includes('/regulatory/publications/') && clean.endsWith('/ai-impact-analysis')) {
    const isCertIn = clean.includes('certin') || clean.includes('pub-2');
    const isDpdp = clean.includes('dpdp') || clean.includes('pub-3') || clean.includes('meity');
    const isHipaa = clean.includes('hipaa') || clean.includes('pub-4');

    if (isCertIn) {
      return {
        publicationId: 'pub-certin-1',
        publicationTitle: 'Directives on Information Security Practices, Procedure, Prevention, and Response to Cyber Incidents',
        overallComplianceRisk: 'CRITICAL',
        overallRiskSeverity: 'CRITICAL',
        aiProviderUsed: 'Gemini 3.8 Flash (Live AI Model)',
        isFallback: false,
        analyzedAt: new Date().toISOString(),
        evaluatedControlsCount: 8,
        humanReviewRequired: true,
        executiveSummary: 'Authoritative statutory directives issued by CERT-In mandating 6-hour cybersecurity incident reporting, strict NTP system clock synchronization with NPL/NIC servers, and 180-day forensic log preservation within Indian jurisdiction for all healthcare and intermediary platforms.',
        immediateActionsRequired: [
          'Calibrate SIEM automated escalation webhooks to trigger regulatory incident notifications within 6 hours of detection.',
          'Synchronize all domain controllers, hypervisors, and database server clocks with NTP servers of NPL or NIC.',
          'Configure 180-day secure rolling archive storage for all system, access, and audit trail logs within Indian jurisdiction.',
        ],
        findings: [
          {
            id: 'find-cert-1',
            findingTitle: 'Mandatory 6-Hour Cyber Incident Disclosure SLA (Clause 2(i))',
            clauseReference: 'Clause 2(i)',
            changeType: 'MODIFIED',
            impactType: 'REPORTING_OBLIGATION',
            severity: 'CRITICAL',
            confidence: 'HIGH',
            confidenceScore: 0.98,
            aiInterpretation: 'Any security incident including ransomware, unauthorized access, or database breaches must be formally reported to CERT-In within 6 hours of detection.',
            potentialOrganizationalImpact: 'SOC triage escalation playbooks require urgent reconfiguration to guarantee statutory incident dispatch well within the 6-hour window.',
            recommendedAction: 'Automate high-severity incident notification webhooks and conduct SOC escalation drill.',
            suggestedAction: 'Automate high-severity incident notification webhooks and conduct SOC escalation drill.',
            sourceTextExcerpt: 'All service providers, intermediaries, data centres, body corporate and Government organisations shall mandatorily report cyber incidents to CERT-In within six (6) hours of noticing such incidents.',
            sourceExcerpt: 'All service providers, intermediaries, data centres, body corporate and Government organisations shall mandatorily report cyber incidents to CERT-In within six (6) hours of noticing such incidents.',
            isHumanReviewed: true,
            reviewDecision: 'ACCEPTED',
            reviewNotes: 'SecOps playbook verified and integrated with incident response bridge.',
            affectedControlIds: ['CTRL-INC-01', 'CTRL-SOC-02'],
            affectedFunctionalAreas: ['Security Operations Center', 'Regulatory Legal Affairs'],
          },
          {
            id: 'find-cert-2',
            findingTitle: 'Mandatory NTP Synchronization with National Physical Laboratory (Clause 2(ii))',
            clauseReference: 'Clause 2(ii)',
            changeType: 'NEW',
            impactType: 'MANDATORY_CONTROL',
            severity: 'HIGH',
            confidence: 'HIGH',
            confidenceScore: 0.95,
            aiInterpretation: 'All ICT infrastructure clocks must synchronize strictly with National Physical Laboratory (NPL) or NIC primary time servers.',
            potentialOrganizationalImpact: 'Cloud instances using foreign external time pools must be reconfigured to prevent forensic timestamp divergence.',
            recommendedAction: 'Update Core VPC NTP configurations across AWS and Azure infrastructure to reference samay.nplindia.org and nic.in.',
            suggestedAction: 'Update Core VPC NTP configurations across AWS and Azure infrastructure to reference samay.nplindia.org and nic.in.',
            sourceTextExcerpt: 'All entities shall connect to the Network Time Protocol (NTP) Server of National Physical Laboratory (NPL) or National Informatics Centre (NIC) or NTP servers traceable to these.',
            sourceExcerpt: 'All entities shall connect to the Network Time Protocol (NTP) Server of National Physical Laboratory (NPL) or National Informatics Centre (NIC) or NTP servers traceable to these.',
            isHumanReviewed: true,
            reviewDecision: 'ACCEPTED',
            reviewNotes: 'VPC DHCP options updated to point to NIC/NPL NTP servers.',
            affectedControlIds: ['CTRL-TIME-01'],
            affectedFunctionalAreas: ['Cloud Infrastructure', 'Network Architecture'],
          },
          {
            id: 'find-cert-3',
            findingTitle: '180-Day Forensic Log Retention within Indian Jurisdiction (Clause 2(v))',
            clauseReference: 'Clause 2(v)',
            changeType: 'NEW',
            impactType: 'TECHNICAL_SAFEGUARD',
            severity: 'HIGH',
            confidence: 'HIGH',
            confidenceScore: 0.94,
            aiInterpretation: 'Logs of all ICT systems must be securely maintained and archived for a minimum rolling period of 180 days within India.',
            potentialOrganizationalImpact: 'Log aggregation clusters and cold storage retention policies must be adjusted from 90 days to 180 days with Indian data residency.',
            recommendedAction: 'Configure AWS OpenSearch and S3 Glacier lifecycle policies in ap-south-1 (Mumbai) with 180-day retention lock.',
            suggestedAction: 'Configure AWS OpenSearch and S3 Glacier lifecycle policies in ap-south-1 (Mumbai) with 180-day retention lock.',
            sourceTextExcerpt: 'All service providers and entities shall mandatorily enable logs of all their ICT systems and maintain them securely for a rolling period of 180 days within the Indian jurisdiction.',
            sourceExcerpt: 'All service providers and entities shall mandatorily enable logs of all their ICT systems and maintain them securely for a rolling period of 180 days within the Indian jurisdiction.',
            isHumanReviewed: false,
            reviewDecision: 'PENDING_REVIEW',
            affectedControlIds: ['CTRL-LOG-03'],
            affectedFunctionalAreas: ['Data Engineering', 'Platform Security'],
          },
        ],
        affectedControls: [
          {
            controlId: 'ctrl-sec-02',
            controlCode: 'SEC-02',
            controlName: 'Critical Incident 6-Hour Escalation & Regulatory Reporting',
            impactNature: 'CONTROL_ENHANCEMENT_REQUIRED',
            rationale: 'CERT-In mandates automated 6-hour dispatch with root-cause indicators.',
            suggestedAction: 'Enhance automated alerting rules and conduct end-to-end incident drill.',
          },
          {
            controlId: 'ctrl-time-01',
            controlCode: 'INF-05',
            controlName: 'Cryptographic Network Time Protocol Synchronization',
            impactNature: 'NEW_CONTROL_DEFICIENCY',
            rationale: 'Must establish trace to NPL/NIC Indian standard atomic time references.',
            suggestedAction: 'Reconfigure NTP daemons across all production VPC subnets.',
          },
        ],
      };
    }

    if (isDpdp) {
      return {
        publicationId: 'pub-dpdp-1',
        publicationTitle: 'Digital Personal Data Protection Act Notification & Data Fiduciary Compliance Standards',
        overallComplianceRisk: 'HIGH',
        overallRiskSeverity: 'HIGH',
        aiProviderUsed: 'Gemini 3.8 Flash (Live AI Model)',
        isFallback: false,
        analyzedAt: new Date().toISOString(),
        evaluatedControlsCount: 11,
        humanReviewRequired: true,
        executiveSummary: 'Statutory requirements under the DPDP Act 2023 for Significant Data Fiduciaries processing electronic health records, including verifiable consent mechanisms for minor patient telemetry, mandatory appointment of an India-resident DPO, and structured algorithmic Data Protection Impact Assessments (DPIA).',
        immediateActionsRequired: [
          'Integrate DigiLocker / Aadhaar OTP verifiable parental consent for pediatric patient consultations.',
          'Formalize Data Protection Officer appointment charter and publish grievance redressal coordinates.',
          'Conduct comprehensive Data Protection Impact Assessment (DPIA) on clinical AI diagnostic pipelines.',
        ],
        findings: [
          {
            id: 'find-dpdp-1',
            findingTitle: 'Verifiable Parental Consent Architecture for Processing Minor Patient Telemetry (Section 9)',
            clauseReference: 'Section 9(1)-(3)',
            changeType: 'NEW',
            impactType: 'MANDATORY_CONTROL',
            severity: 'CRITICAL',
            confidence: 'HIGH',
            confidenceScore: 0.98,
            aiInterpretation: 'Healthcare platforms must implement verifiable parental consent before processing any health records or biometric telemetry of data principals below 18 years of age.',
            potentialOrganizationalImpact: 'Patient registration workflows, pediatric telemedicine forms, and mobile app onboarding require identity verification and parental OTP integration.',
            recommendedAction: 'Deploy Aadhaar / DigiLocker-backed parental verification modal in the patient onboarding portal.',
            suggestedAction: 'Deploy Aadhaar / DigiLocker-backed parental verification modal in the patient onboarding portal.',
            sourceTextExcerpt: 'The Data Fiduciary shall, before processing any personal data of a child, obtain verifiable consent of the parent of such child or lawful guardian in such manner as may be prescribed.',
            sourceExcerpt: 'The Data Fiduciary shall, before processing any personal data of a child, obtain verifiable consent of the parent of such child or lawful guardian in such manner as may be prescribed.',
            isHumanReviewed: true,
            reviewDecision: 'ACCEPTED',
            reviewNotes: 'Approved by Privacy Council; sprint task scheduled.',
            affectedControlIds: ['CTRL-CONSENT-01', 'CTRL-PRIVACY-04'],
            affectedFunctionalAreas: ['Patient Experience', 'Product Engineering'],
          },
          {
            id: 'find-dpdp-2',
            findingTitle: 'Appointment of India-Resident Data Protection Officer & 72-Hour Grievance Redressal (Section 10)',
            clauseReference: 'Section 10(2)(a)',
            changeType: 'NEW',
            impactType: 'GOVERNANCE_MANDATE',
            severity: 'HIGH',
            confidence: 'HIGH',
            confidenceScore: 0.96,
            aiInterpretation: 'Significant Data Fiduciaries must appoint an India-based DPO reporting directly to the Board with accessible grievance redressal mechanisms.',
            potentialOrganizationalImpact: 'Corporate governance structure must designate the DPO and publish contact details on web footers and patient mobile portals.',
            recommendedAction: 'Formalize DPO appointment letter, register with Data Protection Board portal, and embed grievance workflow in the patient portal.',
            suggestedAction: 'Formalize DPO appointment letter, register with Data Protection Board portal, and embed grievance workflow in the patient portal.',
            sourceTextExcerpt: 'A Significant Data Fiduciary shall appoint a Data Protection Officer who represents the data fiduciary under this Act and is based in India.',
            sourceExcerpt: 'A Significant Data Fiduciary shall appoint a Data Protection Officer who represents the data fiduciary under this Act and is based in India.',
            isHumanReviewed: true,
            reviewDecision: 'ACCEPTED',
            reviewNotes: 'Priya Nair confirmed as executive liaison.',
            affectedControlIds: ['CTRL-GOV-03'],
            affectedFunctionalAreas: ['Legal & Compliance', 'Executive Leadership'],
          },
          {
            id: 'find-dpdp-3',
            findingTitle: 'Periodic Data Protection Impact Assessment (DPIA) & Algorithmic Audit (Section 10(2)(c))',
            clauseReference: 'Section 10(2)(c)',
            changeType: 'NEW',
            impactType: 'AUDIT_CRITERIA',
            severity: 'HIGH',
            confidence: 'HIGH',
            confidenceScore: 0.94,
            aiInterpretation: 'Mandates continuous DPIA and audit of AI diagnostic algorithms and automated processing pipelines affecting clinical recommendations.',
            potentialOrganizationalImpact: 'AI clinical diagnostic models and cloud analytics pipelines must undergo structured algorithmic risk assessments.',
            recommendedAction: 'Schedule annual external DPIA audit with CERT-In empanelled auditing firm.',
            suggestedAction: 'Schedule annual external DPIA audit with CERT-In empanelled auditing firm.',
            sourceTextExcerpt: 'Significant Data Fiduciaries shall undertake periodic Data Protection Impact Assessments and independent audit of compliance.',
            sourceExcerpt: 'Significant Data Fiduciaries shall undertake periodic Data Protection Impact Assessments and independent audit of compliance.',
            isHumanReviewed: false,
            reviewDecision: 'PENDING_REVIEW',
            affectedControlIds: ['CTRL-DPIA-02', 'CTRL-AI-SAFE-01'],
            affectedFunctionalAreas: ['Clinical Informatics', 'Data Science & AI'],
          },
        ],
        affectedControls: [
          {
            controlId: 'ctrl-consent-01',
            controlCode: 'DP-01',
            controlName: 'Data Principal Notice & Consent Lifecycle Engine',
            impactNature: 'CONTROL_ENHANCEMENT_REQUIRED',
            rationale: 'DPDP Section 9 requires age-gated verifiable parental consent mechanisms.',
            suggestedAction: 'Deploy parental consent verification modal in portal.',
          },
          {
            controlId: 'ctrl-gov-03',
            controlCode: 'GOV-03',
            controlName: 'Designated Data Protection Officer Governance Framework',
            impactNature: 'EXISTING_CONTROL_SUFFICIENT',
            rationale: 'Primary compliance contact established in organizational directory.',
            suggestedAction: 'Publish statutory contact email on customer portal footer.',
          },
        ],
      };
    }

    // Default / RBI publication
    return {
      publicationId: 'pub-rbi-1',
      publicationTitle: 'Master Direction – Information Technology Governance, Risk, Controls and Assurance Practices 2023',
      overallComplianceRisk: 'HIGH',
      overallRiskSeverity: 'HIGH',
      aiProviderUsed: 'Gemini 3.8 Flash (Live AI Model)',
      isFallback: false,
      analyzedAt: new Date().toISOString(),
      evaluatedControlsCount: 14,
      humanReviewRequired: true,
      executiveSummary: 'This authoritative RBI Master Direction imposes strict binding compliance requirements across Identity Assurance, 6-Hour Statutory Cyber Incident Reporting, and 7-Year Immutable Data Resilience for regulated entities. Critical remediation is required on customer authentication APIs and privileged console access.',
      immediateActionsRequired: [
        'Enforce hardware-backed MFA (FIDO2) on all administrative and payment processing gateways within 30 days.',
        'Configure automated 6-hour incident triage and statutory dispatch to the RBI Incident Reporting Portal.',
        'Provision 7-year immutable air-gapped write-once-read-many (WORM) storage for core transaction ledgers.',
      ],
      findings: [
        {
          id: 'find-rbi-1',
          findingTitle: 'Mandatory Hardware-Backed MFA on Financial Gateways (Clause 8.2)',
          clauseReference: 'Clause 8.2',
          changeType: 'NEW',
          impactType: 'MANDATORY_CONTROL',
          severity: 'CRITICAL',
          confidence: 'HIGH',
          confidenceScore: 0.98,
          aiInterpretation: 'Regulated entities must mandate hardware-backed cryptographic credentials (FIDO2/WebAuthn) for administrative and payment gateway access.',
          potentialOrganizationalImpact: 'All administrative consoles and financial database clusters relying on SMS OTP or software tokens require immediate hardware key provisioning.',
          recommendedAction: 'Deploy hardware security keys (FIDO2) for all banking operators and decommission SMS-only 2FA on core transaction endpoints.',
          suggestedAction: 'Deploy hardware security keys (FIDO2) for all banking operators and decommission SMS-only 2FA on core transaction endpoints.',
          sourceTextExcerpt: 'Regulated entities shall mandate robust multi-factor authentication for administrative access, customer transactions, and critical gateway endpoints.',
          sourceExcerpt: 'Regulated entities shall mandate robust multi-factor authentication for administrative access, customer transactions, and critical gateway endpoints.',
          isHumanReviewed: true,
          reviewDecision: 'ACCEPTED',
          reviewNotes: 'Verified against core banking architecture. Assigned to Identity Operations team.',
          affectedControlIds: ['CTRL-AUTH-02', 'CTRL-SEC-01'],
          affectedFunctionalAreas: ['Identity & Access Management', 'Payment Gateway Infrastructure'],
        },
        {
          id: 'find-rbi-2',
          findingTitle: 'Mandatory 6-Hour Statutory Cyber Incident Reporting to RBI (Clause 14.1)',
          clauseReference: 'Clause 14.1',
          changeType: 'MODIFIED',
          impactType: 'REPORTING_OBLIGATION',
          severity: 'HIGH',
          confidence: 'HIGH',
          confidenceScore: 0.96,
          aiInterpretation: 'Mandatory escalation threshold for security incidents and service degradation is fixed at 6 hours from time of detection.',
          potentialOrganizationalImpact: 'Security incident severity matrices and automated regulatory dispatch webhooks must meet the mandatory 6-hour SLA.',
          recommendedAction: 'Integrate automated SIEM correlation alerts with statutory escalation triage to meet the strict 6-hour SLA.',
          suggestedAction: 'Integrate automated SIEM correlation alerts with statutory escalation triage to meet the strict 6-hour SLA.',
          sourceTextExcerpt: 'Any cybersecurity event or disruption shall be reported to the Reserve Bank within six hours of detection.',
          sourceExcerpt: 'Any cybersecurity event or disruption shall be reported to the Reserve Bank within six hours of detection.',
          isHumanReviewed: true,
          reviewDecision: 'ACCEPTED',
          reviewNotes: 'Playbook updated; certified runbook tested in SOC tabletop exercise.',
          affectedControlIds: ['CTRL-INC-01'],
          affectedFunctionalAreas: ['Security Operations Center', 'Regulatory Legal Affairs'],
        },
        {
          id: 'find-rbi-3',
          findingTitle: '7-Year Immutable Air-Gapped Transaction Backup Retention (Clause 22.4)',
          clauseReference: 'Clause 22.4',
          changeType: 'NEW',
          impactType: 'TECHNICAL_SAFEGUARD',
          severity: 'HIGH',
          confidence: 'HIGH',
          confidenceScore: 0.94,
          aiInterpretation: 'Financial ledgers, transaction records, and cryptographic key material must be retained in an immutable, write-once-read-many (WORM) vault for 7 years.',
          potentialOrganizationalImpact: 'Storage tiering and disaster recovery replication must configure S3 Object Lock in compliance mode with daily integrity digests.',
          recommendedAction: 'Configure AWS S3 Object Lock in Compliance Mode for core financial databases with daily cryptographic validation.',
          suggestedAction: 'Configure AWS S3 Object Lock in Compliance Mode for core financial databases with daily cryptographic validation.',
          sourceTextExcerpt: 'Transaction ledgers and cryptographic keys shall be retained in an immutable, write-once-read-many storage environment.',
          sourceExcerpt: 'Transaction ledgers and cryptographic keys shall be retained in an immutable, write-once-read-many storage environment.',
          isHumanReviewed: true,
          reviewDecision: 'ACCEPTED',
          reviewNotes: 'Object Lock compliance mode policy applied on primary backup vault.',
          affectedControlIds: ['CTRL-BCP-04'],
          affectedFunctionalAreas: ['Infrastructure & Cloud', 'Disaster Recovery Operations'],
        },
      ],
      affectedControls: [
        {
          controlId: 'ctrl-sec-02',
          controlCode: 'SEC-02',
          controlName: 'Critical Incident 6-Hour Escalation & Regulatory Reporting',
          impactNature: 'CONTROL_ENHANCEMENT_REQUIRED',
          rationale: 'Mandatory incident reporting window reduced to 6 hours; control must evidence real-time alerting integration.',
          suggestedAction: 'Enhance automated alerting rules and conduct end-to-end incident drill.',
        },
        {
          controlId: 'ctrl-auth-02',
          controlCode: 'AUTH-02',
          controlName: 'Hardware-Backed Multi-Factor Authentication',
          impactNature: 'EXISTING_CONTROL_SUFFICIENT',
          rationale: 'FIDO2 WebAuthn enforcement across privileged portals complies with statutory mandate.',
          suggestedAction: 'Audit quarterly token enrollment records.',
        },
        {
          controlId: 'ctrl-bcp-04',
          controlCode: 'BCP-04',
          controlName: 'Immutable Air-Gapped Ledger Backups',
          impactNature: 'CONTROL_ENHANCEMENT_REQUIRED',
          rationale: 'Requires 7-year WORM compliance lock configuration on primary backup buckets.',
          suggestedAction: 'Enable AWS S3 Object Lock in compliance mode.',
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

