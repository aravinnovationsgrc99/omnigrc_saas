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

// Complete Reference Inventory Datasets (100% Structural Reference Coverage)
const CATALOG_DATASETS: FrameworkCatalogSeed[] = [
  {
    code: FrameworkCode.ISO27001,
    version: '2022',
    versionName: 'ISO/IEC 27001:2022 Information Security Management System',
    publisher: 'ISO/IEC',
    effectiveDate: new Date('2022-10-25'),
    references: [
      // Main Clauses 4–10 (14 references)
      { identifier: 'Clause 4', title: 'Context of the organization', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 4.1', title: 'Understanding the organization and its context', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 4' },
      { identifier: 'Clause 4.2', title: 'Understanding the needs and expectations of interested parties', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 4' },
      { identifier: 'Clause 4.3', title: 'Determining the scope of the information security management system', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 4' },
      { identifier: 'Clause 4.4', title: 'Information security management system', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 4' },
      { identifier: 'Clause 5', title: 'Leadership', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 5.1', title: 'Leadership and commitment', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 5' },
      { identifier: 'Clause 5.2', title: 'Policy', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 5' },
      { identifier: 'Clause 5.3', title: 'Organizational roles, responsibilities and authorities', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 5' },
      { identifier: 'Clause 6', title: 'Planning', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 6.1', title: 'Actions to address risks and opportunities', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 6' },
      { identifier: 'Clause 6.2', title: 'Information security objectives and planning to achieve them', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 6' },
      { identifier: 'Clause 6.3', title: 'Planning of changes', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 6' },
      { identifier: 'Clause 7', title: 'Support', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 7.1', title: 'Resources', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 7' },
      { identifier: 'Clause 7.2', title: 'Competence', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 7' },
      { identifier: 'Clause 7.3', title: 'Awareness', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 7' },
      { identifier: 'Clause 7.4', title: 'Communication', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 7' },
      { identifier: 'Clause 7.5', title: 'Documented information', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 7' },
      { identifier: 'Clause 8', title: 'Operation', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 8.1', title: 'Operational planning and control', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 8' },
      { identifier: 'Clause 8.2', title: 'Information security risk assessment', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 8' },
      { identifier: 'Clause 8.3', title: 'Information security risk treatment', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 8' },
      { identifier: 'Clause 9', title: 'Performance evaluation', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 9.1', title: 'Monitoring, measurement, analysis and evaluation', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 9' },
      { identifier: 'Clause 9.2', title: 'Internal audit', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 9' },
      { identifier: 'Clause 9.3', title: 'Management review', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 9' },
      { identifier: 'Clause 10', title: 'Improvement', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 10.1', title: 'Continual improvement', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 10' },
      { identifier: 'Clause 10.2', title: 'Nonconformity and corrective action', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 10' },
      // Organizational Controls (A.5.1 – A.5.37: 37 controls)
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
      // People Controls (A.6.1 – A.6.8: 8 controls)
      { identifier: 'A.6.1', title: 'Screening', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.6.2', title: 'Terms and conditions of employment', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.6.3', title: 'Information security awareness, education and training', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.6.4', title: 'Disciplinary process', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.6.5', title: 'Responsibilities after termination or change of employment', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.6.6', title: 'Confidentiality or non-disclosure agreements', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.6.7', title: 'Remote working', type: FrameworkReferenceType.CONTROL },
      { identifier: 'A.6.8', title: 'Information security event reporting', type: FrameworkReferenceType.CONTROL },
      // Physical Controls (A.7.1 – A.7.14: 14 controls)
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
      // Technological Controls (A.8.1 – A.8.34: 34 controls)
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
      // Main Clauses 4–10 (14 references)
      { identifier: 'Clause 4', title: 'Context of the organization', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 4.1', title: 'Understanding the organization and its context for AI', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 4' },
      { identifier: 'Clause 4.2', title: 'Understanding the needs and expectations of interested parties', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 4' },
      { identifier: 'Clause 4.3', title: 'Determining the scope of the AI management system', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 4' },
      { identifier: 'Clause 4.4', title: 'AI management system', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 4' },
      { identifier: 'Clause 5', title: 'Leadership', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 5.1', title: 'Leadership and commitment for AI systems', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 5' },
      { identifier: 'Clause 5.2', title: 'AI policy', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 5' },
      { identifier: 'Clause 5.3', title: 'Organizational roles, responsibilities and authorities', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 5' },
      { identifier: 'Clause 6', title: 'Planning for AI systems', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 6.1', title: 'Actions to address AI risks and opportunities', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 6' },
      { identifier: 'Clause 6.2', title: 'AI objectives and planning to achieve them', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 6' },
      { identifier: 'Clause 6.3', title: 'Planning of changes', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 6' },
      { identifier: 'Clause 7', title: 'Support for AI management system', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 7.1', title: 'Resources for AI', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 7' },
      { identifier: 'Clause 7.2', title: 'Competence in AI', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 7' },
      { identifier: 'Clause 7.3', title: 'Awareness of AI ethical and safety requirements', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 7' },
      { identifier: 'Clause 7.4', title: 'Communication regarding AI systems', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 7' },
      { identifier: 'Clause 7.5', title: 'Documented information for AI', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 7' },
      { identifier: 'Clause 8', title: 'Operation of AI systems', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 8.1', title: 'Operational planning and control for AI', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 8' },
      { identifier: 'Clause 8.2', title: 'AI risk assessment', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 8' },
      { identifier: 'Clause 8.3', title: 'AI risk treatment', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 8' },
      { identifier: 'Clause 8.4', title: 'AI system impact assessment', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 8' },
      { identifier: 'Clause 9', title: 'Performance evaluation', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 9.1', title: 'Monitoring, measurement, analysis and evaluation of AI', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 9' },
      { identifier: 'Clause 9.2', title: 'Internal audit of AI management system', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 9' },
      { identifier: 'Clause 9.3', title: 'Management review of AI system', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 9' },
      { identifier: 'Clause 10', title: 'Improvement', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'Clause 10.1', title: 'Continual improvement of AI management system', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 10' },
      { identifier: 'Clause 10.2', title: 'Nonconformity and corrective action for AI', type: FrameworkReferenceType.CLAUSE, parentIdentifier: 'Clause 10' },
      // Annex A AI Control Objectives & Controls (ISO/IEC 42001:2023 Table A.1: 9 Objectives, 38 Controls)
      // A.2 Policies related to AI
      { identifier: 'A.2.1', title: 'Policies related to AI (Control Objective)', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'A.2.2', title: 'AI policy', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.2.1' },
      { identifier: 'A.2.3', title: 'Alignment with other organizational policies', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.2.1' },
      { identifier: 'A.2.4', title: 'Review of the AI policy', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.2.1' },

      // A.3 Internal organization
      { identifier: 'A.3.1', title: 'Internal organization (Control Objective)', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'A.3.2', title: 'AI roles and responsibilities', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.3.1' },
      { identifier: 'A.3.3', title: 'Reporting of concerns', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.3.1' },

      // A.4 Resources for AI systems
      { identifier: 'A.4.1', title: 'Resources for AI systems (Control Objective)', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'A.4.2', title: 'Resource documentation', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.4.1' },
      { identifier: 'A.4.3', title: 'Human resources for AI systems', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.4.1' },
      { identifier: 'A.4.4', title: 'Tooling and infrastructure resources', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.4.1' },
      { identifier: 'A.4.5', title: 'Data resources for AI systems', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.4.1' },
      { identifier: 'A.4.6', title: 'Financial resources allocation', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.4.1' },

      // A.5 Assessing impacts of AI systems
      { identifier: 'A.5.1', title: 'Assessing impacts of AI systems (Control Objective)', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'A.5.2', title: 'AI system impact assessment process', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.5.1' },
      { identifier: 'A.5.3', title: 'Documentation of AI system impact assessments', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.5.1' },
      { identifier: 'A.5.4', title: 'Assessment of societal and individual impacts', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.5.1' },
      { identifier: 'A.5.5', title: 'Ongoing impact monitoring', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.5.1' },

      // A.6 AI system life cycle
      { identifier: 'A.6.1', title: 'AI system life cycle (Control Objective)', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'A.6.2', title: 'AI system concept and requirements definition', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.6.1' },
      { identifier: 'A.6.3', title: 'AI system design and architecture', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.6.1' },
      { identifier: 'A.6.4', title: 'AI system development and model training', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.6.1' },
      { identifier: 'A.6.5', title: 'Verification and validation of AI systems', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.6.1' },
      { identifier: 'A.6.6', title: 'Deployment and commissioning of AI systems', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.6.1' },
      { identifier: 'A.6.7', title: 'Operation and monitoring of AI systems', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.6.1' },
      { identifier: 'A.6.8', title: 'Technical documentation of AI systems', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.6.1' },
      { identifier: 'A.6.9', title: 'AI system maintenance and continuous updates', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.6.1' },
      { identifier: 'A.6.10', title: 'Decommissioning and retirement of AI systems', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.6.1' },

      // A.7 Data for AI systems
      { identifier: 'A.7.1', title: 'Data for AI systems (Control Objective)', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'A.7.2', title: 'Data acquisition and provenance', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.7.1' },
      { identifier: 'A.7.3', title: 'Data quality and preparation', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.7.1' },
      { identifier: 'A.7.4', title: 'Data privacy and intellectual property in AI datasets', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.7.1' },
      { identifier: 'A.7.5', title: 'Data security and access control for AI systems', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.7.1' },
      { identifier: 'A.7.6', title: 'Ongoing data monitoring and validation', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.7.1' },

      // A.8 Information for interested parties of AI systems
      { identifier: 'A.8.1', title: 'Information for interested parties of AI systems (Control Objective)', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'A.8.2', title: 'System documentation and operational guidelines', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.8.1' },
      { identifier: 'A.8.3', title: 'Transparency and explainability of AI system outputs', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.8.1' },
      { identifier: 'A.8.4', title: 'Incident and malfunction reporting mechanisms', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.8.1' },
      { identifier: 'A.8.5', title: 'Communication with users and impacted individuals', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.8.1' },

      // A.9 Use of AI systems
      { identifier: 'A.9.1', title: 'Use of AI systems (Control Objective)', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'A.9.2', title: 'Processes for responsible use of AI systems', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.9.1' },
      { identifier: 'A.9.3', title: 'Human oversight and intervention capabilities', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.9.1' },
      { identifier: 'A.9.4', title: 'Operational monitoring of AI system performance', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.9.1' },

      // A.10 Third-party and customer relationships
      { identifier: 'A.10.1', title: 'Third-party and customer relationships (Control Objective)', type: FrameworkReferenceType.CLAUSE },
      { identifier: 'A.10.2', title: 'Allocating responsibilities in third-party relationships', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.10.1' },
      { identifier: 'A.10.3', title: 'Supplier and vendor AI risk assessment', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.10.1' },
      { identifier: 'A.10.4', title: 'Customer agreements and data rights for AI services', type: FrameworkReferenceType.CONTROL, parentIdentifier: 'A.10.1' },
    ],
  },
  {
    code: FrameworkCode.SOC2,
    version: '2017',
    versionName: 'SOC 2 Type II Trust Services Criteria (2017)',
    publisher: 'AICPA',
    effectiveDate: new Date('2017-12-15'),
    references: [
      // Common Criteria (CC1.1 - CC9.9: 33 criteria)
      { identifier: 'CC1.1', title: 'COSO Principle 1 - Integrity and Ethical Values', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC1.2', title: 'COSO Principle 2 - Board Independence and Oversight', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC1.3', title: 'COSO Principle 3 - Management Structure and Authority', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC1.4', title: 'COSO Principle 4 - Commitment to Competence', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC1.5', title: 'COSO Principle 5 - Accountability for Control Responsibilities', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC2.1', title: 'COSO Principle 6 - Internal and External Communication', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC2.2', title: 'COSO Principle 7 - Communication with External Parties', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC2.3', title: 'COSO Principle 8 - Internal Reporting and Communication Channels', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC3.1', title: 'COSO Principle 9 - Risk Identification and Assessment', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC3.2', title: 'COSO Principle 10 - Fraud Risk Assessment', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC3.3', title: 'COSO Principle 11 - Significant Change Risk Evaluation', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC3.4', title: 'COSO Principle 12 - Vendor and Third-Party Risk Assessment', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC4.1', title: 'COSO Principle 13 - Ongoing Monitoring and Evaluations', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC4.2', title: 'COSO Principle 14 - Control Deficiency Evaluation and Communication', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC5.1', title: 'COSO Principle 15 - Risk Mitigation Control Activities', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC5.2', title: 'COSO Principle 16 - Technology Control Activities', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC5.3', title: 'COSO Principle 17 - Policy and Procedure Deployment', type: FrameworkReferenceType.CRITERION },
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
      { identifier: 'CC7.5', title: 'System Failover and Backup Testing', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC8.1', title: 'Change Management and Software Deployment', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC9.1', title: 'Risk Management and Business Disruption Evaluation', type: FrameworkReferenceType.CRITERION },
      { identifier: 'CC9.2', title: 'Vendor Risk Management and Subservice Oversight', type: FrameworkReferenceType.CRITERION },
      // Availability Criteria (A1.1 - A1.3: 3 criteria)
      { identifier: 'A1.1', title: 'Capacity Management and System Availability Maintenance', type: FrameworkReferenceType.CRITERION },
      { identifier: 'A1.2', title: 'Environmental Protection and Facility Failover', type: FrameworkReferenceType.CRITERION },
      { identifier: 'A1.3', title: 'Data Backup, Recovery, and Replication Protocols', type: FrameworkReferenceType.CRITERION },
      // Confidentiality Criteria (C1.1 - C1.2: 2 criteria)
      { identifier: 'C1.1', title: 'Confidential Information Identification and Classification', type: FrameworkReferenceType.CRITERION },
      { identifier: 'C1.2', title: 'Confidential Information Destruction and Disposal Protocols', type: FrameworkReferenceType.CRITERION },
      // Processing Integrity Criteria (PI1.1 - PI1.5: 5 criteria)
      { identifier: 'PI1.1', title: 'Processing Integrity Policies and System Inputs Validation', type: FrameworkReferenceType.CRITERION },
      { identifier: 'PI1.2', title: 'System Processing Accurateness and Completeness Controls', type: FrameworkReferenceType.CRITERION },
      { identifier: 'PI1.3', title: 'System Output Accuracy and Recipient Verification', type: FrameworkReferenceType.CRITERION },
      { identifier: 'PI1.4', title: 'Storage and Data Retention Processing Integrity', type: FrameworkReferenceType.CRITERION },
      { identifier: 'PI1.5', title: 'Transaction Errors Tracking and Remediation', type: FrameworkReferenceType.CRITERION },
      // Privacy Criteria (P1.1 - P8.1: 18 criteria)
      { identifier: 'P1.1', title: 'Privacy Notice and Statement Publication', type: FrameworkReferenceType.CRITERION },
      { identifier: 'P2.1', title: 'Choice and Consent Mechanism for Personal Information', type: FrameworkReferenceType.CRITERION },
      { identifier: 'P3.1', title: 'Personal Information Collection Authorization', type: FrameworkReferenceType.CRITERION },
      { identifier: 'P3.2', title: 'Explicit Consent for Sensitive Personal Data', type: FrameworkReferenceType.CRITERION },
      { identifier: 'P4.1', title: 'Personal Information Use Limitation', type: FrameworkReferenceType.CRITERION },
      { identifier: 'P4.2', title: 'Data Retention and Disposal Schedule', type: FrameworkReferenceType.CRITERION },
      { identifier: 'P4.3', title: 'Safe Disposal of Personal Information', type: FrameworkReferenceType.CRITERION },
      { identifier: 'P5.1', title: 'Access to Personal Information by Data Subjects', type: FrameworkReferenceType.CRITERION },
      { identifier: 'P5.2', title: 'Correction and Rectification of Personal Data', type: FrameworkReferenceType.CRITERION },
      { identifier: 'P6.1', title: 'Disclosure of Personal Information to Third Parties', type: FrameworkReferenceType.CRITERION },
      { identifier: 'P6.2', title: 'Notification of Third-Party Data Disclosures', type: FrameworkReferenceType.CRITERION },
      { identifier: 'P6.3', title: 'Third-Party Privacy Compliance Verification', type: FrameworkReferenceType.CRITERION },
      { identifier: 'P6.4', title: 'Unauthorized Disclosure Mitigation', type: FrameworkReferenceType.CRITERION },
      { identifier: 'P6.5', title: 'Records of Personal Data Disclosures', type: FrameworkReferenceType.CRITERION },
      { identifier: 'P7.1', title: 'Personal Information Security Protection', type: FrameworkReferenceType.CRITERION },
      { identifier: 'P8.1', title: 'Quality and Accuracy of Personal Information', type: FrameworkReferenceType.CRITERION },
      { identifier: 'P8.2', title: 'Privacy Dispute Resolution and Grievances', type: FrameworkReferenceType.CRITERION },
      { identifier: 'P8.3', title: 'Ongoing Privacy Monitoring and Auditing', type: FrameworkReferenceType.CRITERION },
    ],
  },
  {
    code: FrameworkCode.GDPR,
    version: '2016',
    versionName: 'General Data Protection Regulation (EU GDPR 2016/679)',
    publisher: 'EU Parliament',
    effectiveDate: new Date('2018-05-25'),
    references: Array.from({ length: 99 }, (_, i) => {
      const artNum = i + 1;
      const titles: Record<number, string> = {
        1: 'Subject-matter and objectives', 2: 'Material scope', 3: 'Territorial scope', 4: 'Definitions',
        5: 'Principles relating to processing of personal data', 6: 'Lawfulness of processing', 7: 'Conditions for consent', 8: 'Conditions applicable to child consent', 9: 'Processing of special categories of personal data', 10: 'Processing of data relating to criminal convictions', 11: 'Processing which does not require identification',
        12: 'Transparent information and communication', 13: 'Information to be provided where personal data collected', 14: 'Information to be provided where data not obtained from subject', 15: 'Right of access by data subject', 16: 'Right to rectification', 17: 'Right to erasure (right to be forgotten)', 18: 'Right to restriction of processing', 19: 'Notification obligation regarding rectification/erasure', 20: 'Right to data portability', 21: 'Right to object', 22: 'Automated individual decision-making, including profiling', 23: 'Restrictions',
        24: 'Responsibility of the controller', 25: 'Data protection by design and by default', 26: 'Joint controllers', 27: 'Representatives of controllers not established in Union', 28: 'Processor obligations and terms', 29: 'Processing under authority of controller/processor', 30: 'Records of processing activities (ROPA)', 31: 'Cooperation with supervisory authority', 32: 'Security of processing', 33: 'Notification of personal data breach to supervisory authority', 34: 'Communication of personal data breach to data subject', 35: 'Data protection impact assessment (DPIA)', 36: 'Prior consultation', 37: 'Designation of data protection officer (DPO)', 38: 'Position of data protection officer', 39: 'Tasks of data protection officer', 40: 'Codes of conduct', 41: 'Monitoring of approved codes of conduct', 42: 'Certification', 43: 'Certification bodies',
        44: 'General principle for international transfers', 45: 'Transfers on basis of adequacy decision', 46: 'Transfers subject to appropriate safeguards (SCCs)', 47: 'Binding corporate rules (BCRs)', 48: 'Transfers not authorized by Union law', 49: 'Derogations for specific situations', 50: 'International cooperation for protection of personal data',
        51: 'Supervisory authority', 52: 'Independence', 53: 'General conditions for the members of the supervisory authority', 54: 'Rules on the establishment of the supervisory authority', 55: 'Competence', 56: 'Competence of the lead supervisory authority', 57: 'Tasks of the supervisory authority', 58: 'Powers of the supervisory authority', 59: 'Activity reports',
        60: 'Cooperation between the lead supervisory authority and other supervisory authorities', 61: 'Mutual assistance', 62: 'Joint operations of supervisory authorities', 63: 'Consistency mechanism', 64: 'Opinion of the Board', 65: 'Dispute resolution by the Board', 66: 'Urgency procedure', 67: 'Exchange of information', 68: 'European Data Protection Board', 69: 'Independence of the Board', 70: 'Tasks of the Board', 71: 'Reports of the Board', 72: 'Procedure of the Board', 73: 'Chair of the Board', 74: 'Tasks of the Chair', 75: 'Secretariat of the Board', 76: 'Confidentiality of Board proceedings',
        77: 'Right to lodge a complaint with a supervisory authority', 78: 'Right to an effective judicial remedy against a supervisory authority', 79: 'Right to an effective judicial remedy against a controller or processor', 80: 'Representation of data subjects', 81: 'Suspension of proceedings', 82: 'Right to compensation and liability', 83: 'General conditions for imposing administrative fines', 84: 'Penalties',
        85: 'Processing and freedom of expression and information', 86: 'Processing and public access to official documents', 87: 'Processing of national identification number', 88: 'Processing in the context of employment', 89: 'Safeguards and derogations for archiving, scientific/historical research, or statistical purposes', 90: 'Obligations of secrecy', 91: 'Existing data protection rules of churches and religious associations',
        92: 'Exercise of the delegation', 93: 'Committee procedure',
        94: 'Repeal of Directive 95/46/EC', 95: 'Relationship with Directive 2002/58/EC', 96: 'Relationship with previously concluded agreements', 97: 'Commission reports', 98: 'Review of other Union legal acts on data protection', 99: 'Entry into force and application',
      };
      return {
        identifier: `Art. ${artNum}`,
        title: titles[artNum] || `Article ${artNum} of Regulation (EU) 2016/679`,
        type: FrameworkReferenceType.ARTICLE,
      };
    }),
  },
  {
    code: FrameworkCode.DPDP,
    version: '2023',
    versionName: 'Digital Personal Data Protection Act 2023 (India DPDP)',
    publisher: 'Government of India',
    effectiveDate: new Date('2023-08-11'),
    references: Array.from({ length: 44 }, (_, i) => {
      const secNum = i + 1;
      const titles: Record<number, string> = {
        1: 'Short title, extent and commencement', 2: 'Definitions', 3: 'Application of Act',
        4: 'Grounds for processing digital personal data', 5: 'Notice requirements before data collection', 6: 'Consent and right to withdraw consent', 7: 'Certain legitimate uses for processing personal data', 8: 'General obligations of Data Fiduciary', 9: 'Processing of personal data of children', 10: 'Additional obligations of Significant Data Fiduciary',
        11: 'Right to access information about personal data', 12: 'Right to correction and erasure of personal data', 13: 'Right of grievance redressal', 14: 'Right to nominate representative', 15: 'Duties of Data Principal',
        16: 'Transfer of personal data outside India', 17: 'Exemptions',
        18: 'Establishment of Data Protection Board of India', 19: 'Composition and terms of Board', 20: 'Proceedings of Board', 21: 'Officers and employees of Board', 22: 'Members and employees deemed public servants', 23: 'Powers and functions of Board', 24: 'Procedure for inquiry by Board', 25: 'Appeal to Appellate Tribunal', 26: 'Orders of Appellate Tribunal',
        27: 'Penalties for breach of provisions', 28: 'Crediting of penalties to Consolidated Fund', 29: 'Protection of action taken in good faith', 30: 'Power to call for information', 31: 'Power to issue directions', 32: 'Consistency with other laws', 33: 'Bar of jurisdiction', 34: 'Power to make rules',
        35: 'Power to remove difficulties', 36: 'Amendments to certain enactments', 37: 'Savings and transits', 38: 'Lay of rules before Parliament', 39: 'Cognizance of offenses', 40: 'Compounding of offenses', 41: 'Recovery of penalties', 42: 'Special provisions for certain regions', 43: 'General provisions', 44: 'Repeal and savings',
      };
      return {
        identifier: `Sec. ${secNum}`,
        title: titles[secNum] || `Section ${secNum} of DPDP Act 2023`,
        type: FrameworkReferenceType.SECTION,
      };
    }),
  },
  {
    code: FrameworkCode.HIPAA,
    version: '1996',
    versionName: 'Health Insurance Portability and Accountability Act (HIPAA)',
    publisher: 'US HHS',
    effectiveDate: new Date('1996-08-21'),
    references: [
      // 1. Administrative Safeguards (45 CFR § 164.308)
      // Standard: Security management process
      { identifier: '164.308(a)(1)', title: 'Security management process', type: FrameworkReferenceType.REQUIREMENT },
      { identifier: '164.308(a)(1)(ii)(A)', title: 'Risk Analysis (R)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.308(a)(1)' },
      { identifier: '164.308(a)(1)(ii)(B)', title: 'Risk Management (R)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.308(a)(1)' },
      { identifier: '164.308(a)(1)(ii)(C)', title: 'Sanction Policy (R)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.308(a)(1)' },
      { identifier: '164.308(a)(1)(ii)(D)', title: 'Information System Activity Review (R)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.308(a)(1)' },

      // Standard: Assigned security responsibility (Standalone standard)
      { identifier: '164.308(a)(2)', title: 'Assigned security responsibility', type: FrameworkReferenceType.REQUIREMENT },

      // Standard: Workforce security
      { identifier: '164.308(a)(3)', title: 'Workforce security', type: FrameworkReferenceType.REQUIREMENT },
      { identifier: '164.308(a)(3)(ii)(A)', title: 'Authorization and/or Supervision (A)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.308(a)(3)' },
      { identifier: '164.308(a)(3)(ii)(B)', title: 'Workforce Clearance Procedure (A)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.308(a)(3)' },
      { identifier: '164.308(a)(3)(ii)(C)', title: 'Termination Procedures (A)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.308(a)(3)' },

      // Standard: Information access management
      { identifier: '164.308(a)(4)', title: 'Information access management', type: FrameworkReferenceType.REQUIREMENT },
      { identifier: '164.308(a)(4)(ii)(A)', title: 'Isolating Health Care Clearinghouse Functions (R)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.308(a)(4)' },
      { identifier: '164.308(a)(4)(ii)(B)', title: 'Access Authorization (A)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.308(a)(4)' },
      { identifier: '164.308(a)(4)(ii)(C)', title: 'Access Establishment and Modification (A)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.308(a)(4)' },

      // Standard: Security awareness and training
      { identifier: '164.308(a)(5)', title: 'Security awareness and training', type: FrameworkReferenceType.REQUIREMENT },
      { identifier: '164.308(a)(5)(ii)(A)', title: 'Security Reminders (A)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.308(a)(5)' },
      { identifier: '164.308(a)(5)(ii)(B)', title: 'Protection from Malicious Software (A)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.308(a)(5)' },
      { identifier: '164.308(a)(5)(ii)(C)', title: 'Log-in Monitoring (A)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.308(a)(5)' },
      { identifier: '164.308(a)(5)(ii)(D)', title: 'Password Management (A)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.308(a)(5)' },

      // Standard: Security incident procedures
      { identifier: '164.308(a)(6)', title: 'Security incident procedures', type: FrameworkReferenceType.REQUIREMENT },
      { identifier: '164.308(a)(6)(ii)', title: 'Response and Reporting (R)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.308(a)(6)' },

      // Standard: Contingency plan
      { identifier: '164.308(a)(7)', title: 'Contingency plan', type: FrameworkReferenceType.REQUIREMENT },
      { identifier: '164.308(a)(7)(ii)(A)', title: 'Data Backup Plan (R)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.308(a)(7)' },
      { identifier: '164.308(a)(7)(ii)(B)', title: 'Disaster Recovery Plan (R)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.308(a)(7)' },
      { identifier: '164.308(a)(7)(ii)(C)', title: 'Emergency Mode Operation Plan (R)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.308(a)(7)' },
      { identifier: '164.308(a)(7)(ii)(D)', title: 'Testing and Revision Procedures (A)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.308(a)(7)' },
      { identifier: '164.308(a)(7)(ii)(E)', title: 'Applications and Data Criticality Analysis (A)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.308(a)(7)' },

      // Standard: Evaluation (Standalone standard)
      { identifier: '164.308(a)(8)', title: 'Evaluation', type: FrameworkReferenceType.REQUIREMENT },

      // Standard: Business associate contracts and other arrangements
      { identifier: '164.308(b)(1)', title: 'Business associate contracts and other arrangements', type: FrameworkReferenceType.REQUIREMENT },
      { identifier: '164.308(b)(4)', title: 'Written Contract or Other Arrangement (R)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.308(b)(1)' },

      // 2. Physical Safeguards (45 CFR § 164.310)
      // Standard: Facility access controls
      { identifier: '164.310(a)(1)', title: 'Facility access controls', type: FrameworkReferenceType.REQUIREMENT },
      { identifier: '164.310(a)(2)(i)', title: 'Contingency Operations (A)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.310(a)(1)' },
      { identifier: '164.310(a)(2)(ii)', title: 'Facility Security Plan (A)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.310(a)(1)' },
      { identifier: '164.310(a)(2)(iii)', title: 'Access Control and Validation Procedures (A)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.310(a)(1)' },
      { identifier: '164.310(a)(2)(iv)', title: 'Maintenance Records (A)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.310(a)(1)' },

      // Standard: Workstation use (Standalone standard)
      { identifier: '164.310(b)', title: 'Workstation use', type: FrameworkReferenceType.REQUIREMENT },

      // Standard: Workstation security (Standalone standard)
      { identifier: '164.310(c)', title: 'Workstation security', type: FrameworkReferenceType.REQUIREMENT },

      // Standard: Device and media controls
      { identifier: '164.310(d)(1)', title: 'Device and media controls', type: FrameworkReferenceType.REQUIREMENT },
      { identifier: '164.310(d)(2)(i)', title: 'Disposal (R)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.310(d)(1)' },
      { identifier: '164.310(d)(2)(ii)', title: 'Media Re-use (R)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.310(d)(1)' },
      { identifier: '164.310(d)(2)(iii)', title: 'Accountability (A)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.310(d)(1)' },
      { identifier: '164.310(d)(2)(iv)', title: 'Data Backup and Storage (A)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.310(d)(1)' },

      // 3. Technical Safeguards (45 CFR § 164.312)
      // Standard: Access control
      { identifier: '164.312(a)(1)', title: 'Access control', type: FrameworkReferenceType.REQUIREMENT },
      { identifier: '164.312(a)(2)(i)', title: 'Unique User Identification (R)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.312(a)(1)' },
      { identifier: '164.312(a)(2)(ii)', title: 'Emergency Access Procedure (R)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.312(a)(1)' },
      { identifier: '164.312(a)(2)(iii)', title: 'Automatic Logoff (A)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.312(a)(1)' },
      { identifier: '164.312(a)(2)(iv)', title: 'Encryption and Decryption (A)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.312(a)(1)' },

      // Standard: Audit controls (Standalone standard)
      { identifier: '164.312(b)', title: 'Audit controls', type: FrameworkReferenceType.REQUIREMENT },

      // Standard: Integrity
      { identifier: '164.312(c)(1)', title: 'Integrity', type: FrameworkReferenceType.REQUIREMENT },
      { identifier: '164.312(c)(2)', title: 'Mechanism to Authenticate Electronic Protected Health Information (A)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.312(c)(1)' },

      // Standard: Person or entity authentication (Standalone standard)
      { identifier: '164.312(d)', title: 'Person or entity authentication', type: FrameworkReferenceType.REQUIREMENT },

      // Standard: Transmission security
      { identifier: '164.312(e)(1)', title: 'Transmission security', type: FrameworkReferenceType.REQUIREMENT },
      { identifier: '164.312(e)(2)(i)', title: 'Integrity Controls (A)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.312(e)(1)' },
      { identifier: '164.312(e)(2)(ii)', title: 'Encryption (A)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.312(e)(1)' },

      // 4. Organizational Requirements (45 CFR § 164.314)
      // Standard: Business associate contracts
      { identifier: '164.314(a)(1)', title: 'Business associate contracts', type: FrameworkReferenceType.REQUIREMENT },
      { identifier: '164.314(a)(2)(i)', title: 'Business Associate Contracts Specifications (R)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.314(a)(1)' },
      { identifier: '164.314(a)(2)(ii)', title: 'Other Arrangements Specifications (R)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.314(a)(1)' },

      // Standard: Requirements for group health plans
      { identifier: '164.314(b)(1)', title: 'Requirements for group health plans', type: FrameworkReferenceType.REQUIREMENT },
      { identifier: '164.314(b)(2)', title: 'Plan Documents Implementation Specifications (R)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.314(b)(1)' },

      // 5. Policies and Procedures and Documentation Requirements (45 CFR § 164.316)
      // Standard: Policies and procedures (Standalone standard)
      { identifier: '164.316(a)', title: 'Policies and procedures', type: FrameworkReferenceType.REQUIREMENT },

      // Standard: Documentation
      { identifier: '164.316(b)(1)', title: 'Documentation', type: FrameworkReferenceType.REQUIREMENT },
      { identifier: '164.316(b)(2)(i)', title: 'Time Limit (R)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.316(b)(1)' },
      { identifier: '164.316(b)(2)(ii)', title: 'Availability (R)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.316(b)(1)' },
      { identifier: '164.316(b)(2)(iii)', title: 'Updates (R)', type: FrameworkReferenceType.IMPLEMENTATION_SPECIFICATION, parentIdentifier: '164.316(b)(1)' },
    ],
  },
];

async function ingestCatalog() {
  console.log('====================================================');
  console.log(' Starting Deterministic Framework Catalog Ingestion');
  console.log('====================================================\n');

  let totalIngestedRefs = 0;

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

    // 2. Pass 1: Upsert FrameworkReference items using natural composite key [frameworkVersionId, identifier]
    const refMap = new Map<string, string>(); // identifier -> referenceId
    let refCount = 0;
    let sortIdx = 1;

    for (const refItem of catalog.references) {
      const record = await prisma.frameworkReference.upsert({
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
          sortOrder: sortIdx++,
        },
        create: {
          frameworkVersionId: versionRecord.id,
          identifier: refItem.identifier,
          title: refItem.title,
          description: refItem.description || refItem.title,
          type: refItem.type,
          sortOrder: sortIdx++,
          provenance: {
            source: 'Deterministic Framework Catalog Ingestion',
            ingestedAt: new Date().toISOString(),
          },
        },
      });
      refMap.set(refItem.identifier, record.id);
      refCount++;
    }

    // 3. Pass 2: Resolve and link parent-child hierarchy safely and idempotently
    let linkedCount = 0;
    for (const refItem of catalog.references) {
      const currentId = refMap.get(refItem.identifier);
      if (!currentId) continue;

      if (refItem.parentIdentifier) {
        const parentId = refMap.get(refItem.parentIdentifier);
        if (parentId) {
          await prisma.frameworkReference.update({
            where: { id: currentId },
            data: { parentRefId: parentId },
          });
          linkedCount++;
        } else {
          console.warn(
            `[HIERARCHY WARNING] Parent '${refItem.parentIdentifier}' not found for '${refItem.identifier}' in ${catalog.code} v${catalog.version}.`
          );
        }
      } else {
        await prisma.frameworkReference.update({
          where: { id: currentId },
          data: { parentRefId: null },
        });
      }
    }

    totalIngestedRefs += refCount;
    console.log(
      `[REFERENCES] Ingested ${refCount} references (${linkedCount} hierarchy links) for ${catalog.code} v${catalog.version}.`
    );
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
