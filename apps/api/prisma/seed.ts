import { PrismaClient } from '@prisma/client';
import { Role, PodRegion, PodStatus, FrameworkCode, AssetType, AssetCriticality, RiskStatus, MappingStatus, ModelTier, TaskStatus } from '@omnigrc/shared';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding OMNiGRC database...');

  // Create demo Organization
  const org = await prisma.organization.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Meridian Health Pvt. Ltd.',
      primaryRegion: 'India',
    },
  });

  // Create ADMIN user
  const passwordHash = await bcrypt.hash('Admin@123456', 10);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@meridian.com' },
    update: {},
    create: {
      organizationId: org.id,
      name: 'Priya Nair',
      email: 'admin@meridian.com',
      passwordHash,
      role: Role.ADMIN,
    },
  });

  // Seed 4 RegionalPods (India = ACTIVE, others = INACTIVE)
  const pods = [
    { region: PodRegion.INDIA, status: PodStatus.ACTIVE },
    { region: PodRegion.UK, status: PodStatus.INACTIVE },
    { region: PodRegion.EU, status: PodStatus.INACTIVE },
    { region: PodRegion.AUSTRALIA, status: PodStatus.INACTIVE },
  ];

  for (const pod of pods) {
    await prisma.regionalPod.upsert({
      where: {
        organizationId_region: {
          organizationId: org.id,
          region: pod.region,
        },
      },
      update: { status: pod.status },
      create: {
        organizationId: org.id,
        region: pod.region,
        status: pod.status,
      },
    });
  }

  // Seed Frameworks
  const frameworksData = [
    { code: FrameworkCode.ISO27001, name: 'ISO/IEC 27001:2022 Information Security' },
    { code: FrameworkCode.ISO42001, name: 'ISO/IEC 42001:2023 Artificial Intelligence Management System' },
    { code: FrameworkCode.SOC2, name: 'SOC 2 Type II Trust Services Criteria' },
    { code: FrameworkCode.GDPR, name: 'General Data Protection Regulation (EU GDPR)' },
    { code: FrameworkCode.DPDP, name: 'Digital Personal Data Protection Act (India DPDP 2023)' },
    { code: FrameworkCode.HIPAA, name: 'Health Insurance Portability and Accountability Act (HIPAA)' },
  ];

  const frameworkMap = new Map<string, string>();

  for (const fw of frameworksData) {
    const createdFw = await prisma.framework.upsert({
      where: { code: fw.code },
      update: { name: fw.name },
      create: {
        code: fw.code,
        name: fw.name,
      },
    });
    frameworkMap.set(fw.code, createdFw.id);
  }

  // Seed 15-20 Verified Clauses per Framework
  const clausesData: Record<FrameworkCode, Array<{ code: string; title: string }>> = {
    [FrameworkCode.ISO27001]: [
      { code: 'A.5.1', title: 'Policies for information security' },
      { code: 'A.5.15', title: 'Access control' },
      { code: 'A.5.19', title: 'Information security in supplier relationships' },
      { code: 'A.5.23', title: 'Information security for use of cloud services' },
      { code: 'A.5.24', title: 'Information security incident management planning and preparation' },
      { code: 'A.5.30', title: 'ICT readiness for business continuity' },
      { code: 'A.7.2', title: 'Personnel screening' },
      { code: 'A.7.4', title: 'Physical security monitoring' },
      { code: 'A.8.1', title: 'User endpoint devices' },
      { code: 'A.8.7', title: 'Protection against malware' },
      { code: 'A.8.8', title: 'Management of technical vulnerabilities' },
      { code: 'A.8.9', title: 'Configuration management' },
      { code: 'A.8.12', title: 'Data leakage prevention' },
      { code: 'A.8.16', title: 'Monitoring activities' },
      { code: 'A.8.20', title: 'Network security' },
      { code: 'A.8.24', title: 'Use of cryptography' },
      { code: 'A.8.28', title: 'Secure coding' },
      { code: 'A.8.31', title: 'Separation of development, test and production environments' },
    ],
    [FrameworkCode.ISO42001]: [
      { code: 'Clause 5.1', title: 'Leadership and commitment for AI management' },
      { code: 'Clause 6.1', title: 'Actions to address risks and opportunities for AI systems' },
      { code: 'Clause 6.2', title: 'AI objectives and planning to achieve them' },
      { code: 'Clause 7.2', title: 'Competence of personnel operating AI systems' },
      { code: 'Clause 8.2', title: 'AI risk assessment' },
      { code: 'Clause 8.4', title: 'AI system lifecycle management' },
      { code: 'Annex A.2', title: 'AI policy and organizational alignment' },
      { code: 'Annex A.3', title: 'Internal organization and AI governance' },
      { code: 'Annex A.4', title: 'Resources for AI systems' },
      { code: 'Annex A.5', title: 'Assessing impacts of AI systems' },
      { code: 'Annex A.6', title: 'AI system lifecycle controls' },
      { code: 'Annex A.7', title: 'Data for AI systems' },
      { code: 'Annex A.8', title: 'Information for interested parties of AI systems' },
      { code: 'Annex A.9', title: 'Use of AI systems' },
      { code: 'Annex A.10', title: 'Third-party and supplier relationships for AI systems' },
    ],
    [FrameworkCode.SOC2]: [
      { code: 'CC1.1', title: 'COSO Principle 1 - Commitment to Integrity and Ethical Values' },
      { code: 'CC2.1', title: 'COSO Principle 6 - Internal and External Communication' },
      { code: 'CC3.1', title: 'COSO Principle 7 - Risk Identification and Assessment' },
      { code: 'CC5.1', title: 'COSO Principle 12 - Control Activity Deployment' },
      { code: 'CC6.1', title: 'Logical Access Controls and User Authentication' },
      { code: 'CC6.2', title: 'User Registration and Authorization Management' },
      { code: 'CC6.3', title: 'Access Revocation and Role Modification' },
      { code: 'CC6.6', title: 'Boundary Protection and Network Security' },
      { code: 'CC6.7', title: 'Transmission Encryption and Data Security' },
      { code: 'CC6.8', title: 'Unauthorized and Malicious Code Prevention' },
      { code: 'CC7.1', title: 'Infrastructure Vulnerability Management and Monitoring' },
      { code: 'CC7.2', title: 'Security Incident Detection and Response' },
      { code: 'CC8.1', title: 'Change Management and Code Deployment' },
      { code: 'CC9.2', title: 'Risk Mitigation and Vendor Risk Management' },
    ],
    [FrameworkCode.GDPR]: [
      { code: 'Art. 5', title: 'Principles relating to processing of personal data' },
      { code: 'Art. 6', title: 'Lawfulness of processing' },
      { code: 'Art. 12', title: 'Transparent information and communication for data subjects' },
      { code: 'Art. 15', title: 'Right of access by the data subject' },
      { code: 'Art. 17', title: 'Right to erasure (right to be forgotten)' },
      { code: 'Art. 24', title: 'Responsibility of the controller' },
      { code: 'Art. 25', title: 'Data protection by design and by default' },
      { code: 'Art. 28', title: 'Data processor obligations and contracts' },
      { code: 'Art. 30', title: 'Records of processing activities (ROPA)' },
      { code: 'Art. 32', title: 'Security of processing and technical measures' },
      { code: 'Art. 33', title: 'Notification of a personal data breach to supervisory authority' },
      { code: 'Art. 35', title: 'Data protection impact assessment (DPIA)' },
      { code: 'Art. 37', title: 'Designation of Data Protection Officer (DPO)' },
      { code: 'Art. 44', title: 'General principle for international data transfers' },
    ],
    [FrameworkCode.DPDP]: [
      { code: 'Sec. 4', title: 'Grounds for processing digital personal data' },
      { code: 'Sec. 5', title: 'Notice requirements before data processing' },
      { code: 'Sec. 6', title: 'Consent requirements and withdrawal mechanism' },
      { code: 'Sec. 7', title: 'Certain legitimate uses of personal data' },
      { code: 'Sec. 8', title: 'Obligations of Data Fiduciary (security safeguards & breach notification)' },
      { code: 'Sec. 9', title: 'Processing of personal data of children' },
      { code: 'Sec. 10', title: 'Additional obligations of Significant Data Fiduciary' },
      { code: 'Sec. 11', title: 'Right to access information about personal data' },
      { code: 'Sec. 12', title: 'Right to correction and erasure of personal data' },
      { code: 'Sec. 16', title: 'Processing of personal data outside India (cross-border transfers)' },
    ],
    [FrameworkCode.HIPAA]: [
      { code: '§ 164.308(a)(1)', title: 'Security Management Process (Risk Analysis & Risk Management)' },
      { code: '§ 164.308(a)(3)', title: 'Workforce Security (Authorization & Clearance)' },
      { code: '§ 164.308(a)(4)', title: 'Information Access Management' },
      { code: '§ 164.308(a)(5)', title: 'Security Awareness and Training' },
      { code: '§ 164.308(a)(6)', title: 'Security Incident Procedures' },
      { code: '§ 164.308(a)(7)', title: 'Contingency Plan and Disaster Recovery' },
      { code: '§ 164.308(a)(8)', title: 'Evaluation and Periodic Assessment' },
      { code: '§ 164.310(a)(1)', title: 'Facility Access Controls' },
      { code: '§ 164.310(d)(1)', title: 'Device and Media Controls' },
      { code: '§ 164.312(a)(1)', title: 'Access Control (Unique User ID & Encryption)' },
      { code: '§ 164.312(b)', title: 'Audit Controls and Logging' },
      { code: '§ 164.312(c)(1)', title: 'Integrity Controls for ePHI' },
      { code: '§ 164.312(e)(1)', title: 'Transmission Security (In-Transit Encryption)' },
      { code: '§ 164.502', title: 'Uses and Disclosures of Protected Health Information (PHI)' },
    ],
  };

  const clauseMap = new Map<string, string>(); // key: `${frameworkCode}_${code}` -> clauseId

  for (const [fwCode, clauses] of Object.entries(clausesData)) {
    const fwId = frameworkMap.get(fwCode);
    if (!fwId) continue;

    for (const c of clauses) {
      const existingClause = await prisma.frameworkClause.findFirst({
        where: { frameworkId: fwId, code: c.code },
      });

      if (existingClause) {
        clauseMap.set(`${fwCode}_${c.code}`, existingClause.id);
      } else {
        const created = await prisma.frameworkClause.create({
          data: {
            frameworkId: fwId,
            code: c.code,
            title: c.title,
          },
        });
        clauseMap.set(`${fwCode}_${c.code}`, created.id);
      }
    }
  }

  // Seed 7 Realistic Demo Assets
  const demoAssets = [
    {
      id: 'a0000000-0000-0000-0000-000000000001',
      name: 'AWS Production Cloud Infrastructure',
      type: AssetType.SOFTWARE,
      description: 'Primary cloud hosting environment for patient portal and API services.',
      owner: 'DevOps Team',
      criticality: AssetCriticality.HIGH,
      vendorName: 'Amazon Web Services',
      dataResidencyRegion: 'India (ap-south-1)',
    },
    {
      id: 'a0000000-0000-0000-0000-000000000002',
      name: 'Patient Health Records DB (PostgreSQL)',
      type: AssetType.DATA_STORE,
      description: 'Encrypted relational database containing electronic health records (EHR).',
      owner: 'Data Engineering',
      criticality: AssetCriticality.HIGH,
      vendorName: 'Amazon RDS',
      dataResidencyRegion: 'India (Mumbai)',
    },
    {
      id: 'a0000000-0000-0000-0000-000000000003',
      name: 'Razorpay Payment Gateway Integration',
      type: AssetType.VENDOR,
      description: 'Third-party payment processor for online patient consultations.',
      owner: 'Finance & Operations',
      criticality: AssetCriticality.HIGH,
      vendorName: 'Razorpay Software Pvt Ltd',
      dataResidencyRegion: 'India',
    },
    {
      id: 'a0000000-0000-0000-0000-000000000004',
      name: 'Corporate Laptops & MacBooks',
      type: AssetType.HARDWARE,
      description: 'Employee workstations managed via MDM with disk encryption enabled.',
      owner: 'IT Support',
      criticality: AssetCriticality.MEDIUM,
      vendorName: 'Apple / Dell',
      dataResidencyRegion: 'On-Premise / Remote',
    },
    {
      id: 'a0000000-0000-0000-0000-000000000005',
      name: 'HubSpot Sales & Marketing CRM',
      type: AssetType.VENDOR,
      description: 'Customer relationship management platform for patient outreach.',
      owner: 'Marketing Team',
      criticality: AssetCriticality.MEDIUM,
      vendorName: 'HubSpot Inc.',
      dataResidencyRegion: 'United States',
    },
    {
      id: 'a0000000-0000-0000-0000-000000000006',
      name: 'Slack & Team Communication Hub',
      type: AssetType.SOFTWARE,
      description: 'Internal messaging tool for healthcare providers and operations staff.',
      owner: 'Internal IT',
      criticality: AssetCriticality.LOW,
      vendorName: 'Slack Technologies',
      dataResidencyRegion: 'United States',
    },
    {
      id: 'a0000000-0000-0000-0000-000000000007',
      name: 'Office CCTV & NVR Systems',
      type: AssetType.HARDWARE,
      description: 'Physical security cameras and network video recorder in Bangalore HQ.',
      owner: 'Physical Security',
      criticality: AssetCriticality.LOW,
      vendorName: 'Hikvision',
      dataResidencyRegion: 'India (Bangalore)',
    },
  ];

  for (const asset of demoAssets) {
    await prisma.asset.upsert({
      where: { id: asset.id },
      update: {
        name: asset.name,
        type: asset.type,
        description: asset.description,
        owner: asset.owner,
        criticality: asset.criticality,
        vendorName: asset.vendorName,
        dataResidencyRegion: asset.dataResidencyRegion,
      },
      create: {
        id: asset.id,
        organizationId: org.id,
        name: asset.name,
        type: asset.type,
        description: asset.description,
        owner: asset.owner,
        criticality: asset.criticality,
        vendorName: asset.vendorName,
        dataResidencyRegion: asset.dataResidencyRegion,
        createdById: adminUser.id,
      },
    });
  }

  // Seed 11 Realistic Demo Risks across likelihood x impact grid (1-5) and statuses
  const demoRisks = [
    {
      id: 'r0000000-0000-0000-0000-000000000001',
      title: 'Unencrypted Patient Health Data in Transit',
      description: 'Legacy internal API endpoints communicating over unencrypted HTTP.',
      likelihood: 4,
      impact: 5,
      status: RiskStatus.OPEN,
      owner: 'SecOps Team',
      assetId: 'a0000000-0000-0000-0000-000000000002',
      treatmentPlan: 'Enforce mandatory TLS 1.3 across all internal and public services by Q3.',
    },
    {
      id: 'r0000000-0000-0000-0000-000000000002',
      title: 'AWS S3 Bucket Public Access Misconfiguration',
      description: 'Risk of diagnostic images being stored in publicly accessible cloud buckets.',
      likelihood: 3,
      impact: 5,
      status: RiskStatus.IN_TREATMENT,
      owner: 'DevOps Lead',
      assetId: 'a0000000-0000-0000-0000-000000000001',
      treatmentPlan: 'Enable AWS S3 Block Public Access globally and deploy automated guardrails.',
    },
    {
      id: 'r0000000-0000-0000-0000-000000000003',
      title: 'Payment Gateway Integration Outage',
      description: 'Downtime in payment gateway processing during peak consultation hours.',
      likelihood: 3,
      impact: 4,
      status: RiskStatus.OPEN,
      owner: 'Finance & Ops',
      assetId: 'a0000000-0000-0000-0000-000000000003',
      treatmentPlan: 'Implement secondary backup gateway failover (BillDesk / PayU).',
    },
    {
      id: 'r0000000-0000-0000-0000-000000000004',
      title: 'Unpatched OS Vulnerabilities on Workstations',
      description: 'Outdated operating system patches on employee laptops exposing endpoints to malware.',
      likelihood: 4,
      impact: 3,
      status: RiskStatus.IN_TREATMENT,
      owner: 'IT Support',
      assetId: 'a0000000-0000-0000-0000-000000000004',
      treatmentPlan: 'Configure automated patch management via MDM with 7-day enforcement window.',
    },
    {
      id: 'r0000000-0000-0000-0000-000000000005',
      title: 'Insufficient Data Audit Retention for DPDP Compliance',
      description: 'Audit logs retained for only 90 days instead of mandatory 1-year compliance window.',
      likelihood: 2,
      impact: 4,
      status: RiskStatus.ACCEPTED,
      owner: 'Compliance Officer',
      treatmentPlan: 'Formal risk acceptance signed off by CISO pending cloud log archive deployment.',
    },
    {
      id: 'r0000000-0000-0000-0000-000000000006',
      title: 'Stale User Access Permissions in Marketing CRM',
      description: 'Former sales employees retaining active CRM login credentials.',
      likelihood: 3,
      impact: 3,
      status: RiskStatus.IN_TREATMENT,
      owner: 'Sales Ops',
      assetId: 'a0000000-0000-0000-0000-000000000005',
      treatmentPlan: 'Enforce automated Okta SAML de-provisioning sync.',
    },
    {
      id: 'r0000000-0000-0000-0000-000000000007',
      title: 'Missing Multi-Factor Authentication on Slack Workspace',
      description: 'Sub-contractors accessing team communication channels without mandatory 2FA.',
      likelihood: 2,
      impact: 3,
      status: RiskStatus.ACCEPTED,
      owner: 'Internal IT',
      assetId: 'a0000000-0000-0000-0000-000000000006',
      treatmentPlan: 'Temporary risk acceptance until enterprise SSO migration completes.',
    },
    {
      id: 'r0000000-0000-0000-0000-000000000008',
      title: 'Physical Tampering of HQ Camera Storage Recorder',
      description: 'Unrestricted physical access to server rack housing CCTV video recorder.',
      likelihood: 1,
      impact: 3,
      status: RiskStatus.CLOSED,
      owner: 'Physical Security',
      assetId: 'a0000000-0000-0000-0000-000000000007',
      treatmentPlan: 'Installed biometric access lock on HQ server room. Risk resolved.',
    },
    {
      id: 'r0000000-0000-0000-0000-000000000009',
      title: 'Phishing & Executive Impersonation Campaign',
      description: 'Targeted spear-phishing attempts soliciting wire transfers.',
      likelihood: 4,
      impact: 4,
      status: RiskStatus.OPEN,
      owner: 'SecOps Team',
      treatmentPlan: 'Deploy email security filtering and conduct quarterly simulated phishing tests.',
    },
    {
      id: 'r0000000-0000-0000-0000-000000000010',
      title: 'Ransomware Infection via Email Attachment',
      description: 'Malicious attachment execution locking local hospital file shares.',
      likelihood: 3,
      impact: 5,
      status: RiskStatus.IN_TREATMENT,
      owner: 'Infrastructure Lead',
      treatmentPlan: 'Deploy CrowdStrike EDR agents across all enterprise endpoints.',
    },
    {
      id: 'r0000000-0000-0000-0000-000000000011',
      title: 'API Rate Limiting Absence on Public Auth Endpoints',
      description: 'Lack of IP throttling on authentication endpoints leading to brute-force risks.',
      likelihood: 2,
      impact: 2,
      status: RiskStatus.CLOSED,
      owner: 'DevOps Team',
      treatmentPlan: 'Deployed NestJS ThrottlerGuard on all public API routes. Closed.',
    },
  ];

  for (const risk of demoRisks) {
    const score = risk.likelihood * risk.impact;
    await prisma.risk.upsert({
      where: { id: risk.id },
      update: {
        title: risk.title,
        description: risk.description,
        likelihood: risk.likelihood,
        impact: risk.impact,
        score,
        status: risk.status,
        owner: risk.owner,
        assetId: risk.assetId || null,
        treatmentPlan: risk.treatmentPlan,
      },
      create: {
        id: risk.id,
        organizationId: org.id,
        title: risk.title,
        description: risk.description,
        likelihood: risk.likelihood,
        impact: risk.impact,
        score,
        status: risk.status,
        owner: risk.owner,
        assetId: risk.assetId || null,
        treatmentPlan: risk.treatmentPlan,
        createdById: adminUser.id,
      },
    });
  }

  // Seed 9 Demo Controls with a realistic spread of APPROVED, SUGGESTED, and OVERRIDDEN mappings
  const demoControls = [
    {
      id: 'c0000000-0000-0000-0000-000000000001',
      name: 'Mandatory TLS 1.3 Data Encryption In-Transit',
      description: 'Enforce cryptographic TLS 1.3 protocol across all API endpoints, microservices, and web portals carrying sensitive data.',
      category: 'Data Protection & Cryptography',
      mappings: [
        { fwCode: FrameworkCode.ISO27001, clauseCode: 'A.8.24', status: MappingStatus.APPROVED, score: 0.94, tier: ModelTier.TIER_1 },
        { fwCode: FrameworkCode.SOC2, clauseCode: 'CC6.7', status: MappingStatus.APPROVED, score: 0.96, tier: ModelTier.TIER_1 },
        { fwCode: FrameworkCode.GDPR, clauseCode: 'Art. 32', status: MappingStatus.APPROVED, score: 0.91, tier: ModelTier.TIER_1 },
        { fwCode: FrameworkCode.DPDP, clauseCode: 'Sec. 8', status: MappingStatus.APPROVED, score: 0.89, tier: ModelTier.TIER_1 },
        { fwCode: FrameworkCode.HIPAA, clauseCode: '§ 164.312(e)(1)', status: MappingStatus.APPROVED, score: 0.95, tier: ModelTier.TIER_1 },
      ],
    },
    {
      id: 'c0000000-0000-0000-0000-000000000002',
      name: 'Role-Based Access Control & Quarterly Permission Reviews',
      description: 'Implement strict least-privilege RBAC policies and conduct quarterly access reviews across enterprise applications.',
      category: 'Identity & Access Management',
      mappings: [
        { fwCode: FrameworkCode.ISO27001, clauseCode: 'A.5.15', status: MappingStatus.APPROVED, score: 0.92, tier: ModelTier.TIER_1 },
        { fwCode: FrameworkCode.SOC2, clauseCode: 'CC6.1', status: MappingStatus.APPROVED, score: 0.95, tier: ModelTier.TIER_1 },
        { fwCode: FrameworkCode.HIPAA, clauseCode: '§ 164.312(a)(1)', status: MappingStatus.APPROVED, score: 0.93, tier: ModelTier.TIER_1 },
        { fwCode: FrameworkCode.GDPR, clauseCode: 'Art. 25', status: MappingStatus.SUGGESTED, score: 0.78, tier: ModelTier.TIER_1 },
      ],
    },
    {
      id: 'c0000000-0000-0000-0000-000000000003',
      name: 'Automated Database Backup & Disaster Recovery Replication',
      description: 'Execute automated daily encrypted snapshot backups of relational databases with multi-region replication for RTO/RPO SLA compliance.',
      category: 'Infrastructure & Resilience',
      mappings: [
        { fwCode: FrameworkCode.ISO27001, clauseCode: 'A.5.30', status: MappingStatus.APPROVED, score: 0.88, tier: ModelTier.TIER_1 },
        { fwCode: FrameworkCode.SOC2, clauseCode: 'CC7.2', status: MappingStatus.SUGGESTED, score: 0.82, tier: ModelTier.TIER_1 },
        { fwCode: FrameworkCode.HIPAA, clauseCode: '§ 164.308(a)(7)', status: MappingStatus.APPROVED, score: 0.94, tier: ModelTier.TIER_1 },
      ],
    },
    {
      id: 'c0000000-0000-0000-0000-000000000004',
      name: 'AI Model Risk & Impact Assessment (DPIA / AIMS)',
      description: 'Perform systematic risk assessments and data protection impact assessments before deploying artificial intelligence algorithms into production.',
      category: 'AI Governance & Privacy',
      mappings: [
        { fwCode: FrameworkCode.ISO42001, clauseCode: 'Clause 8.2', status: MappingStatus.APPROVED, score: 0.97, tier: ModelTier.TIER_2 },
        { fwCode: FrameworkCode.GDPR, clauseCode: 'Art. 35', status: MappingStatus.APPROVED, score: 0.92, tier: ModelTier.TIER_2 },
        { fwCode: FrameworkCode.ISO42001, clauseCode: 'Annex A.5', status: MappingStatus.SUGGESTED, score: 0.86, tier: ModelTier.TIER_2 },
      ],
    },
    {
      id: 'c0000000-0000-0000-0000-000000000005',
      name: 'Centralized Security Event Auditing & SIEM Monitoring',
      description: 'Aggregate application, system, and network authentication audit logs into a SIEM dashboard for threat detection.',
      category: 'Logging & Monitoring',
      mappings: [
        { fwCode: FrameworkCode.ISO27001, clauseCode: 'A.8.16', status: MappingStatus.APPROVED, score: 0.91, tier: ModelTier.TIER_1 },
        { fwCode: FrameworkCode.SOC2, clauseCode: 'CC7.1', status: MappingStatus.APPROVED, score: 0.93, tier: ModelTier.TIER_1 },
        { fwCode: FrameworkCode.HIPAA, clauseCode: '§ 164.312(b)', status: MappingStatus.OVERRIDDEN, score: null, tier: ModelTier.TIER_1 },
      ],
    },
    {
      id: 'c0000000-0000-0000-0000-000000000006',
      name: 'Third-Party Vendor Due Diligence & Contractual Audits',
      description: 'Screen all third-party software and cloud suppliers against security frameworks prior to procurement.',
      category: 'Vendor Management',
      mappings: [
        { fwCode: FrameworkCode.ISO27001, clauseCode: 'A.5.19', status: MappingStatus.APPROVED, score: 0.90, tier: ModelTier.TIER_1 },
        { fwCode: FrameworkCode.SOC2, clauseCode: 'CC9.2', status: MappingStatus.APPROVED, score: 0.89, tier: ModelTier.TIER_1 },
        { fwCode: FrameworkCode.GDPR, clauseCode: 'Art. 28', status: MappingStatus.SUGGESTED, score: 0.77, tier: ModelTier.TIER_1 },
      ],
    },
    {
      id: 'c0000000-0000-0000-0000-000000000007',
      name: 'Data Breach Response & 72-Hour Authority Notification',
      description: 'Establish operational incident response playbooks for notifying supervisory authorities within mandated timeframes following a confirmed personal data breach.',
      category: 'Incident Response & Governance',
      mappings: [
        { fwCode: FrameworkCode.GDPR, clauseCode: 'Art. 33', status: MappingStatus.APPROVED, score: 0.96, tier: ModelTier.TIER_1 },
        { fwCode: FrameworkCode.DPDP, clauseCode: 'Sec. 8', status: MappingStatus.APPROVED, score: 0.94, tier: ModelTier.TIER_1 },
        { fwCode: FrameworkCode.ISO27001, clauseCode: 'A.5.24', status: MappingStatus.SUGGESTED, score: 0.84, tier: ModelTier.TIER_1 },
      ],
    },
    {
      id: 'c0000000-0000-0000-0000-000000000008',
      name: 'Endpoint Workstation Full Disk Encryption & MDM',
      description: 'Deploy hardware disk encryption (BitLocker / FileVault) across corporate laptops managed via centralized MDM policy.',
      category: 'Endpoint Security',
      mappings: [
        { fwCode: FrameworkCode.ISO27001, clauseCode: 'A.8.1', status: MappingStatus.APPROVED, score: 0.93, tier: ModelTier.TIER_1 },
        { fwCode: FrameworkCode.SOC2, clauseCode: 'CC6.8', status: MappingStatus.SUGGESTED, score: 0.81, tier: ModelTier.TIER_1 },
      ],
    },
  ];

  for (const ctrl of demoControls) {
    const createdCtrl = await prisma.control.upsert({
      where: { id: ctrl.id },
      update: {
        name: ctrl.name,
        description: ctrl.description,
        category: ctrl.category,
      },
      create: {
        id: ctrl.id,
        organizationId: org.id,
        name: ctrl.name,
        description: ctrl.description,
        category: ctrl.category,
        createdById: adminUser.id,
      },
    });

    for (const m of ctrl.mappings) {
      const clauseId = clauseMap.get(`${m.fwCode}_${m.clauseCode}`);
      if (!clauseId) continue;

      await prisma.controlFrameworkMapping.upsert({
        where: {
          controlId_frameworkClauseId: {
            controlId: createdCtrl.id,
            frameworkClauseId: clauseId,
          },
        },
        update: {
          status: m.status,
          confidenceScore: m.score,
          modelTier: m.tier,
          reviewedById: m.status !== MappingStatus.SUGGESTED ? adminUser.id : null,
          reviewedAt: m.status !== MappingStatus.SUGGESTED ? new Date() : null,
        },
        create: {
          controlId: createdCtrl.id,
          frameworkClauseId: clauseId,
          status: m.status,
          confidenceScore: m.score,
          modelTier: m.tier,
          reviewedById: m.status !== MappingStatus.SUGGESTED ? adminUser.id : null,
          reviewedAt: m.status !== MappingStatus.SUGGESTED ? new Date() : null,
        },
      });
    }
  }

  // Seed 11 Demo Compliance Tasks across all 4 status columns and 30/60/90 day buckets
  const now = new Date();
  const days = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

  const demoTasks = [
    {
      id: 't0000000-0000-0000-0000-000000000001',
      title: 'Enforce TLS 1.3 Minimum Cryptographic Version on Cloud Gateway',
      description: 'Disable legacy TLS 1.0/1.1 protocols and mandate TLS 1.3 across all AWS ALB listeners.',
      status: TaskStatus.COMPLETE,
      owner: 'DevOps Lead',
      dueDate: days(-10), // Completed in past
      controlId: 'c0000000-0000-0000-0000-000000000001',
    },
    {
      id: 't0000000-0000-0000-0000-000000000002',
      title: 'Conduct Q2 Quarterly RBAC User Access Permission Audit',
      description: 'Review active Okta directory permissions and revoke non-essential administrative access.',
      status: TaskStatus.IN_PROGRESS,
      owner: 'SecOps Team',
      dueDate: days(-3), // OVERDUE (3 days ago)
      controlId: 'c0000000-0000-0000-0000-000000000002',
    },
    {
      id: 't0000000-0000-0000-0000-000000000003',
      title: 'Verify Encrypted Database Snapshot Failover to Secondary Region',
      description: 'Execute periodic disaster recovery drill validating RDS snapshot restoration in ap-southeast-1.',
      status: TaskStatus.NOT_STARTED,
      owner: 'DBA Team',
      dueDate: days(-1), // OVERDUE (1 day ago)
      controlId: 'c0000000-0000-0000-0000-000000000003',
    },
    {
      id: 't0000000-0000-0000-0000-000000000004',
      title: 'Perform AI Model Data Protection Impact Assessment (DPIA)',
      description: 'Document diagnostic AI algorithm training data sources and privacy impact report.',
      status: TaskStatus.UNDER_REVIEW,
      owner: 'Privacy Lead',
      dueDate: days(4), // Due in 4 days (<= 30D)
      controlId: 'c0000000-0000-0000-0000-000000000004',
    },
    {
      id: 't0000000-0000-0000-0000-000000000005',
      title: 'Deploy SIEM Log Ingestion Forwarders to All Kubernetes Nodes',
      description: 'Install Fluentd log collection daemons across production EKS clusters.',
      status: TaskStatus.IN_PROGRESS,
      owner: 'SecOps Lead',
      dueDate: days(14), // Due in 14 days (<= 30D)
      controlId: 'c0000000-0000-0000-0000-000000000005',
    },
    {
      id: 't0000000-0000-0000-0000-000000000006',
      title: 'Execute Vendor SOC 2 Audit Report Review for Razorpay & HubSpot',
      description: 'Collect annual SOC 2 Type II compliance attestations from critical cloud vendors.',
      status: TaskStatus.NOT_STARTED,
      owner: 'Compliance Officer',
      dueDate: days(22), // Due in 22 days (<= 30D)
      controlId: 'c0000000-0000-0000-0000-000000000006',
    },
    {
      id: 't0000000-0000-0000-0000-000000000007',
      title: 'Review 72-Hour Data Breach Incident Notification Playbook',
      description: 'Validate reporting procedures with external legal counsel for DPDP and GDPR breach requirements.',
      status: TaskStatus.UNDER_REVIEW,
      owner: 'Legal & Risk',
      dueDate: days(45), // Due in 45 days (30D - 60D)
      controlId: 'c0000000-0000-0000-0000-000000000007',
    },
    {
      id: 't0000000-0000-0000-0000-000000000008',
      title: 'Mandate MDM BitLocker Encryption Enforcement on Corporate Workstations',
      description: 'Configure automated remote wipe and full-disk encryption policies for corporate laptops.',
      status: TaskStatus.IN_PROGRESS,
      owner: 'IT Support',
      dueDate: days(58), // Due in 58 days (30D - 60D)
      controlId: 'c0000000-0000-0000-0000-000000000008',
    },
    {
      id: 't0000000-0000-0000-0000-000000000009',
      title: 'Annual ISO 27001 Internal Audit Preparation & Evidence Gathering',
      description: 'Gather audit evidence files and control documentation for stage 2 recertification audit.',
      status: TaskStatus.NOT_STARTED,
      owner: 'Compliance Officer',
      dueDate: days(72), // Due in 72 days (60D - 90D)
    },
    {
      id: 't0000000-0000-0000-0000-000000000010',
      title: 'Conduct Employee Phishing Awareness Simulation Training',
      description: 'Launch quarterly simulated spear-phishing campaigns to test employee reporting capabilities.',
      status: TaskStatus.COMPLETE,
      owner: 'SecOps Team',
      dueDate: days(-15),
    },
    {
      id: 't0000000-0000-0000-0000-000000000011',
      title: 'Establish DPDP Data Protection Officer (DPO) Public Notice',
      description: 'Publish DPO contact information on patient health portal per DPDP Section 10 obligations.',
      status: TaskStatus.NOT_STARTED,
      owner: 'Privacy Lead',
      dueDate: days(88), // Due in 88 days (60D - 90D)
    },
  ];

  for (const t of demoTasks) {
    await prisma.complianceTask.upsert({
      where: { id: t.id },
      update: {
        title: t.title,
        description: t.description,
        status: t.status,
        owner: t.owner,
        dueDate: t.dueDate,
        controlId: t.controlId || null,
      },
      create: {
        id: t.id,
        organizationId: org.id,
        title: t.title,
        description: t.description,
        status: t.status,
        owner: t.owner,
        dueDate: t.dueDate,
        controlId: t.controlId || null,
        createdById: adminUser.id,
      },
    });
  }

  console.log('Seeding completed successfully with 7 assets, 11 demo risks, 8 demo controls, and 11 compliance tasks.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
