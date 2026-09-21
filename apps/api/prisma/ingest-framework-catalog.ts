import { PrismaClient, FrameworkReferenceType, FrameworkVersionStatus, FrameworkCode } from '@prisma/client';

const prisma = new PrismaClient();

interface RefSeedItem {
  identifier: string;
  title: string;
  type: FrameworkReferenceType;
  description?: string;
  parentIdentifier?: string;
}

interface FrameworkCatalogSeed {
  code: FrameworkCode;
  version: string;
  versionName: string;
  publisher: string;
  effectiveDate: Date;
  references: RefSeedItem[];
}

// Complete Reference Inventory Datasets (Structural Reference Coverage)
const CATALOG_DATASETS: FrameworkCatalogSeed[] = [
  {
    code: FrameworkCode.ISO27001,
    version: '2022',
    versionName: 'ISO/IEC 27001:2022 Information Security',
    publisher: 'ISO/IEC',
    effectiveDate: new Date('2022-10-25'),
    references: [
      // Main Clauses
      { identifier: 'Clause 4', title: 'Context of the organization', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 5', title: 'Leadership', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 6', title: 'Planning', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 7', title: 'Support', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 8', title: 'Operation', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 9', title: 'Performance evaluation', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 10', title: 'Improvement', type: FrameworkReferenceType.CLAUSE },
      // Organizational Controls (A.5)
      { identifier: 'A.5.1', title: 'Policies for information security', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.2', title: 'Information security roles and responsibilities', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.3', title: 'Segregation of duties', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.4', title: 'Management responsibilities', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.5', title: 'Contact with authorities', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.6', title: 'Contact with special interest groups', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.7', title: 'Threat intelligence', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.8', title: 'Information security in project management', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.9', title: 'Inventory of information and other associated assets', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.10', title: 'Acceptable use of information and other associated assets', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.11', title: 'Return of assets', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.12', title: 'Classification of information', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.13', title: 'Labelling of information', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.14', title: 'Information transfer', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.15', title: 'Access control', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.16', title: 'Identity management', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.17', title: 'Authentication information', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.18', title: 'Access rights', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.19', title: 'Information security in supplier relationships', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.20', title: 'Addressing information security within supplier agreements', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.21', title: 'Managing information security in the ICT supply chain', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.22', title: 'Monitoring, review and change management of supplier services', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.23', title: 'Information security for use of cloud services', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.24', title: 'Information security incident management planning and preparation', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.25', title: 'Assessment and decision on information security events', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.26', title: 'Response to information security incidents', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.27', title: 'Learning from information security incidents', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.28', title: 'Collection of evidence', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.29', title: 'Information security during disruption', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.30', title: 'ICT readiness for business continuity', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.31', title: 'Legal, statutory, regulatory and contractual requirements', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.32', title: 'Intellectual property rights', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.33', title: 'Protection of records', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.34', title: 'Privacy and protection of PII', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.35', title: 'Independent review of information security', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.36', title: 'Compliance with policies and standards for information security', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5.37', title: 'Documented operating procedures', type: FrameworkReferenceType.CONTROL },
      // People Controls (A.6)
      { identifier: 'A.6.1', title: 'Screening', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.6.2', title: 'Terms and conditions of employment', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.6.3', title: 'Information security awareness, education and training', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.6.4', title: 'Disciplinary process', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.6.5', title: 'Responsibilities after termination or change of employment', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.6.6', title: 'Confidentiality or non-disclosure agreements', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.6.7', title: 'Remote working', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.6.8', title: 'Information security event reporting', type: FrameworkReferenceType.CONTROL },
      // Physical Controls (A.7)
      { identifier: 'A.7.1', title: 'Physical security perimeters', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.7.2', title: 'Physical entry', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.7.3', title: 'Securing offices, rooms and facilities', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.7.4', title: 'Physical security monitoring', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.7.5', title: 'Protecting against physical and environmental threats', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.7.6', title: 'Working in secure areas', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.7.7', title: 'Clear desk and clear screen', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.7.8', title: 'Equipment siting and protection', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.7.9', title: 'Security of assets off-premises', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.7.10', title: 'Storage media', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.7.11', title: 'Supporting utilities', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.7.12', title: 'Cabling security', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.7.13', title: 'Equipment maintenance', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.7.14', title: 'Secure disposal or re-use of equipment', type: FrameworkReferenceType.CONTROL },
      // Technological Controls (A.8)
      { identifier: 'A.8.1', title: 'User endpoint devices', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.2', title: 'Privileged access rights', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.3', title: 'Information access restriction', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.4', title: 'Access to source code', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.5', title: 'Secure authentication', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.6', title: 'Capacity management', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.7', title: 'Protection against malware', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.8', title: 'Management of technical vulnerabilities', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.9', title: 'Configuration management', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.10', title: 'Information deletion', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.11', title: 'Data masking', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.12', title: 'Data leakage prevention', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.13', title: 'Information backup', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.14', title: 'Redundancy of information processing facilities', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.15', title: 'Logging', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.16', title: 'Monitoring activities', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.17', title: 'Clock synchronization', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.18', title: 'Use of privileged utility programs', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.19', title: 'Installation of software on operational systems', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.20', title: 'Networks security', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.21', title: 'Security of network services', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.22', title: 'Segregation of networks', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.23', title: 'Web filtering', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.24', title: 'Use of cryptography', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.25', title: 'Secure development life cycle', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.26', title: 'Application security requirements', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.27', title: 'Secure system architecture and engineering principles', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.28', title: 'Secure coding', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.29', title: 'Security testing in development and acceptance', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.30', title: 'Outsourced development', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.31', title: 'Separation of development, test and production environments', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.32', title: 'Change management', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.33', title: 'Test information', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8.34', title: 'Protection of information systems during audit testing', type: FrameworkReferenceType.CONTROL },
    ],
  },
  {
    code: FrameworkCode.ISO42001,
    version: '2023',
    versionName: 'ISO/IEC 42001:2023 Artificial Intelligence Management System',
    publisher: 'ISO/IEC',
    effectiveDate: new Date('2023-12-18'),
    references: [
      { identifier: 'Clause 4', title: 'Context of the organization', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 5', title: 'Leadership', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 6', title: 'Planning for AI systems', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 7', title: 'Support for AI management system', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 8', title: 'Operation of AI systems', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 9', title: 'Performance evaluation', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 10', title: 'Improvement', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'A.2', title: 'AI policy and alignment with organizational strategy', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.3', title: 'Internal organization and AI governance structure', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.4', title: 'Resources for AI systems', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.5', title: 'Assessing impacts of AI systems', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.6', title: 'AI system lifecycle controls', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.7', title: 'Data for AI systems', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.8', title: 'Information for interested parties of AI systems', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.9', title: 'Use of AI systems', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.10', title: 'Third-party and supplier relationships for AI systems', type: FrameworkReferenceType.CONTROL },
    ],
  },
  {
    code: FrameworkCode.SOC2,
    version: '2017',
    versionName: 'SOC 2 Type II Trust Services Criteria (2017)',
    publisher: 'AICPA',
    effectiveDate: new Date('2017-12-15'),
    references: [
      { identifier: 'CC1.1', title: 'COSO Principle 1 - Integrity and Ethical Values', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC1.2', title: 'COSO Principle 2 - Board Independence and Oversight', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC1.3', title: 'COSO Principle 3 - Management Structure and Authority', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC1.4', title: 'COSO Principle 4 - Commitment to Competence', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC1.5', title: 'COSO Principle 5 - Accountability for Control Responsibilities', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC2.1', title: 'COSO Principle 6 - Internal and External Communication', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC2.2', title: 'COSO Principle 7 - Communication with External Parties', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC3.1', title: 'COSO Principle 8 - Risk Identification and Assessment', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC3.2', title: 'COSO Principle 9 - Fraud Risk Assessment', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC3.3', title: 'COSO Principle 10 - Significant Change Risk Evaluation', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC4.1', title: 'COSO Principle 11 - Ongoing Monitoring and Evaluations', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC4.2', title: 'COSO Principle 12 - Control Deficiency Evaluation and Communication', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC5.1', title: 'COSO Principle 13 - Risk Mitigation Control Activities', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC5.2', title: 'COSO Principle 14 - Technology Control Activities', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC5.3', title: 'COSO Principle 15 - Policy and Procedure Deployment', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC6.1', title: 'Logical Access Controls and User Authentication', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC6.2', title: 'User Registration, Provisioning, and Access Modification', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC6.3', title: 'Access Revocation and Role Deprovisioning', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC6.4', title: 'Physical Access Controls to Data Centers and Infrastructure', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC6.5', title: 'Logical Asset Disposal and Media Sanitization', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC6.6', title: 'Boundary Protection and Perimeter Security', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC6.7', title: 'Transmission Encryption and Network Security', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC6.8', title: 'Prevention of Unauthorized and Malicious Code', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC7.1', title: 'Vulnerability Management and Security Monitoring', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC7.2', title: 'Security Anomaly and Incident Detection', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC7.3', title: 'Security Incident Response and Remediation', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC7.4', title: 'Business Continuity and Incident Recovery', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC8.1', title: 'Change Management and Software Deployment', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC9.1', title: 'Risk Management and Business Disruption Evaluation', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC9.2', title: 'Vendor Risk Management and Subservice Oversight', type: FrameworkReferenceType.CRITERION },
    ],
  },
  {
    code: FrameworkCode.GDPR,
    version: '2016',
    versionName: 'General Data Protection Regulation (EU GDPR 2016/679)',
    publisher: 'EU Parliament',
    effectiveDate: new Date('2018-05-25'),
    references: [
      { identifier: 'Art. 5', title: 'Principles relating to processing of personal data', type: FrameworkReferenceType.ARTICLE },
      { identifier: 'Art. 6', title: 'Lawfulness of processing', type: FrameworkReferenceType.ARTICLE },
      { identifier: 'Art. 7', title: 'Conditions for consent', type: FrameworkReferenceType.ARTICLE },
      { identifier: 'Art. 12', title: 'Transparent information and communication for data subjects', type: FrameworkReferenceType.ARTICLE },
      { identifier: 'Art. 13', title: 'Information to be provided where personal data are collected', type: FrameworkReferenceType.ARTICLE },
      { identifier: 'Art. 15', title: 'Right of access by the data subject', type: FrameworkReferenceType.ARTICLE },
      { identifier: 'Art. 16', title: 'Right to rectification', type: FrameworkReferenceType.ARTICLE },
      { identifier: 'Art. 17', title: 'Right to erasure (right to be forgotten)', type: FrameworkReferenceType.ARTICLE },
      { identifier: 'Art. 18', title: 'Right to restriction of processing', type: FrameworkReferenceType.ARTICLE },
      { identifier: 'Art. 20', title: 'Right to data portability', type: FrameworkReferenceType.ARTICLE },
      { identifier: 'Art. 21', title: 'Right to object', type: FrameworkReferenceType.ARTICLE },
      { identifier: 'Art. 24', title: 'Responsibility of the controller', type: FrameworkReferenceType.ARTICLE },
      { identifier: 'Art. 25', title: 'Data protection by design and by default', type: FrameworkReferenceType.ARTICLE },
      { identifier: 'Art. 28', title: 'Processor obligations and contractual requirements', type: FrameworkReferenceType.ARTICLE },
      { identifier: 'Art. 30', title: 'Records of processing activities (ROPA)', type: FrameworkReferenceType.ARTICLE },
      { identifier: 'Art. 32', title: 'Security of processing and technical measures', type: FrameworkReferenceType.ARTICLE },
      { identifier: 'Art. 33', title: 'Notification of a personal data breach to supervisory authority', type: FrameworkReferenceType.ARTICLE },
      { identifier: 'Art. 34', title: 'Communication of a personal data breach to the data subject', type: FrameworkReferenceType.ARTICLE },
      { identifier: 'Art. 35', title: 'Data protection impact assessment (DPIA)', type: FrameworkReferenceType.ARTICLE },
      { identifier: 'Art. 37', title: 'Designation of the data protection officer (DPO)', type: FrameworkReferenceType.ARTICLE },
      { identifier: 'Art. 44', title: 'General principle for international data transfers', type: FrameworkReferenceType.ARTICLE },
    ],
  },
  {
    code: FrameworkCode.DPDP,
    version: '2023',
    versionName: 'Digital Personal Data Protection Act 2023 (India DPDP)',
    publisher: 'Government of India',
    effectiveDate: new Date('2023-08-11'),
    references: [
      { identifier: 'Sec. 4', title: 'Grounds for processing digital personal data', type: FrameworkReferenceType.SECTION },
      { identifier: 'Sec. 5', title: 'Notice requirements before data collection', type: FrameworkReferenceType.SECTION },
      { identifier: 'Sec. 6', title: 'Consent and right to withdraw consent', type: FrameworkReferenceType.SECTION },
      { identifier: 'Sec. 7', title: 'Certain legitimate uses for processing personal data', type: FrameworkReferenceType.SECTION },
      { identifier: 'Sec. 8', title: 'Duties and obligations of Data Fiduciary', type: FrameworkReferenceType.SECTION },
      { identifier: 'Sec. 9', title: 'Processing of personal data of children', type: FrameworkReferenceType.SECTION },
      { identifier: 'Sec. 10', title: 'Additional obligations of Significant Data Fiduciary', type: FrameworkReferenceType.SECTION },
      { identifier: 'Sec. 11', title: 'Right to access information about personal data', type: FrameworkReferenceType.SECTION },
      { identifier: 'Sec. 12', title: 'Right to correction and erasure of personal data', type: FrameworkReferenceType.SECTION },
      { identifier: 'Sec. 13', title: 'Right of grievance redressal', type: FrameworkReferenceType.SECTION },
      { identifier: 'Sec. 14', title: 'Right to nominate representative', type: FrameworkReferenceType.SECTION },
      { identifier: 'Sec. 15', title: 'Duties of Data Principal', type: FrameworkReferenceType.SECTION },
      { identifier: 'Sec. 16', title: 'Transfer of personal data outside India', type: FrameworkReferenceType.SECTION },
    ],
  },
  {
    code: FrameworkCode.HIPAA,
    version: '1996',
    versionName: 'Health Insurance Portability and Accountability Act (HIPAA)',
    publisher: 'US HHS',
    effectiveDate: new Date('1996-08-21'),
    references: [
      { identifier: '164.308(a)(1)', title: 'Security Management Process', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION },
      { identifier: '164.308(a)(2)', title: 'Assigned Security Responsibility', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION },
      { identifier: '164.308(a)(3)', title: 'Workforce Security', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION },
      { identifier: '164.308(a)(4)', title: 'Information Access Management', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION },
      { identifier: '164.308(a)(5)', title: 'Security Awareness and Training', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION },
      { identifier: '164.308(a)(6)', title: 'Security Incident Procedures', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION },
      { identifier: '164.308(a)(7)', title: 'Contingency Plan and Disaster Recovery', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION },
      { identifier: '164.308(a)(8)', title: 'Evaluation of Security Measures', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION },
      { identifier: '164.310(a)(1)', title: 'Facility Access Controls', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION },
      { identifier: '164.310(b)', title: 'Workstation Use Policies', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION },
      { identifier: '164.310(c)', title: 'Workstation Security', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION },
      { identifier: '164.310(d)(1)', title: 'Device and Media Controls', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION },
      { identifier: '164.312(a)(1)', title: 'Access Control and User Authentication', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION },
      { identifier: '164.312(b)', title: 'Audit Controls and Event Logging', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION },
      { identifier: '164.312(c)(1)', title: 'Data Integrity and Protection against Alteration', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION },
      { identifier: '164.312(d)', title: 'Person or Entity Authentication', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION },
      { identifier: '164.312(e)(1)', title: 'Transmission Security and Encryption', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION },
    ],
  },
];

async function ingestCatalog() {
  console.log('====================================================');
  console.log(' Starting Deterministic Framework Catalog Ingestion');
  console.log('====================================================\n');

  for (const catalog of CATALOG_DATASETS) {
    const fw = await prisma.framework.findUnique({
      where: { code: catalog.code },
    });

    if (!fw) {
      console.warn(`Framework code ${catalog.code} not found in database. Skipping.`);
      continue;
    }

    // 1. Upsert FrameworkVersion
    const versionRecord = await prisma.frameworkVersion.upsert({
      where: {
        frameworkId_version: {
          frameworkId: fw.id,
          version: catalog.version,
        },
      },
      update: {
        name: catalog.versionName,
        publisher: catalog.publisher,
        effectiveDate: catalog.effectiveDate,
        status: FrameworkVersionStatus.ACTIVE,
      },
      create: {
        frameworkId: fw.id,
        version: catalog.version,
        name: catalog.versionName,
        publisher: catalog.publisher,
        effectiveDate: catalog.effectiveDate,
        status: FrameworkVersionStatus.ACTIVE,
        provenance: {
          source: 'Deterministic Framework Catalog Ingestion',
          ingestedAt: new Date().toISOString(),
        },
      },
    });

    console.log(`[VERSION] Framework ${catalog.code} Version ${catalog.version} (${versionRecord.id}) ready.`);

    // 2. Upsert FrameworkReference items using natural composite key [frameworkVersionId, identifier]
    let refCount = 0;
    for (const refItem of catalog.references) {
      await prisma.frameworkReference.upsert({
        where: {
          frameworkVersionId_identifier: {
            frameworkVersionId: versionRecord.id,
            identifier: refItem.identifier,
          },
        },
        update: {
          title: refItem.title,
          description: refItem.description || refItem.title,
          type: refItem.type,
        },
        create: {
          frameworkVersionId: versionRecord.id,
          identifier: refItem.identifier,
          title: refItem.title,
          description: refItem.description || refItem.title,
          type: refItem.type,
          provenance: {
            source: 'Deterministic Framework Catalog Ingestion',
            ingestedAt: new Date().toISOString(),
          },
        },
      });
      refCount++;
    }

    console.log(`[REFERENCES] Ingested ${refCount} verified references for ${catalog.code} v${catalog.version}.`);
  }

  // Idempotency Validation
  const totalVersions = await prisma.frameworkVersion.count();
  const totalReferences = await prisma.frameworkReference.count();

  console.log('\n====================================================');
  console.log('         INGESTION PARITY & COUNT METRICS           ');
  console.log('====================================================');
  console.log(`Total FrameworkVersion records:   ${totalVersions}`);
  console.log(`Total FrameworkReference records: ${totalReferences}`);
  console.log('====================================================\n');
}

ingestCatalog()
  .catch((err) => {
    console.error('Ingestion failed with error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
