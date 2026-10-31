import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import { EvidenceService } from '../evidence/evidence.service';
import { ApprovalEngineService } from '../approval/approval-engine.service';
import {
  CreateVendorDto,
  UpdateVendorDto,
  VendorQueryDto,
  CreateVendorAssessmentDto,
  CreateVendorQuestionnaireDto,
  UpdateVendorQuestionnaireDto,
  SubmitVendorQuestionnaireDto,
  ReviewVendorQuestionnaireSubmissionDto,
  CreateVendorAssessmentActionDto,
  UpdateVendorAssessmentActionDto,
  SubmitVendorAssessmentApprovalDto,
  AssessInherentRiskDto,
  CalculateResidualRiskDto,
  VerifyVendorDocumentDto,
  VendorOffboardingDto,
  VerifyVendorAssessmentActionDto,
  ApproveVendorRelationshipDto,
  LifecycleTransitionDto,
} from './dto/vendors.dto';
import {
  VendorDto,
  PaginatedVendorsDto,
  VendorCriticality,
  VendorStatus,
  VendorAssessmentDto,
  VendorAssessmentStatus,
  VendorDocumentDto,
  PaginatedVendorDocumentsDto,
  EvidenceStatus,
  EvidenceScanStatus,
  VendorQuestionnaireDto,
  VendorQuestionnaireSubmissionDto,
  VendorAssessmentActionDto,
  NotificationType,
  InherentRiskAssessmentResultDto,
  ResidualRiskEvaluationResultDto,
} from '@omnigrc/shared';

function encodeVendorDescription(summary: string | null | undefined, tprmData: any): string | null {
  if (!tprmData && !summary) return null;
  return `[TPRM_META]:${JSON.stringify({ summary: summary || '', tprm: tprmData || {} })}`;
}

function decodeVendorDescription(rawDescription: string | null | undefined): { summary: string | null; tprm: any } {
  if (!rawDescription) return { summary: null, tprm: null };
  if (rawDescription.startsWith('[TPRM_META]:')) {
    try {
      const parsed = JSON.parse(rawDescription.slice(12));
      return { summary: parsed.summary || null, tprm: parsed.tprm || null };
    } catch {
      return { summary: rawDescription, tprm: null };
    }
  }
  return { summary: rawDescription, tprm: null };
}

function encodeDocDescription(summary: string | null | undefined, meta: any): string | null {
  if (!meta && !summary) return null;
  return `[DOC_META]:${JSON.stringify({ summary: summary || '', meta: meta || {} })}`;
}

function decodeDocDescription(raw: string | null | undefined): { summary: string | null; meta: any } {
  if (!raw) return { summary: null, meta: null };
  if (raw.startsWith('[DOC_META]:')) {
    try {
      const parsed = JSON.parse(raw.slice(11));
      return { summary: parsed.summary || null, meta: parsed.meta || null };
    } catch {
      return { summary: raw, meta: null };
    }
  }
  return { summary: raw, meta: null };
}

const STANDARD_TPRM_TEMPLATES = [
  {
    title: 'Critical Vendor Comprehensive Assessment (Tier: CRITICAL)',
    description: 'Deep due diligence evaluating Information Security, Data Privacy, BCP/DR, Access Control, and Subcontractor Governance.',
    version: '1.0',
    questions: [
      {
        id: 'SEC-01',
        domain: 'Information Security',
        text: 'Does your organization enforce Multi-Factor Authentication (MFA) across all administrative, cloud, and code-repository environments?',
        type: 'CHOICE',
        required: true,
        options: ['Yes - Hardware Key (FIDO2)', 'Yes - Authenticator App (TOTP)', 'SMS Only', 'No MFA'],
        weight: 15,
      },
      {
        id: 'SEC-02',
        domain: 'Information Security',
        text: 'Is customer data encrypted both at rest (e.g. AES-256) and in transit (e.g. TLS 1.3)?',
        type: 'CHOICE',
        required: true,
        options: ['Yes - Both Rest (AES-256) and Transit (TLS 1.3)', 'In Transit Only', 'At Rest Only', 'No Encryption'],
        weight: 15,
      },
      {
        id: 'PRIV-01',
        domain: 'Data Privacy',
        text: 'Does your organization commit to notifying customers of any confirmed security or data breach within 24 hours?',
        type: 'BOOLEAN',
        required: true,
        weight: 15,
      },
      {
        id: 'BCP-01',
        domain: 'Business Continuity & Disaster Recovery',
        text: 'What are your documented and tested Recovery Time Objective (RTO) and Recovery Point Objective (RPO)?',
        type: 'CHOICE',
        required: true,
        options: ['RTO < 4 hrs, RPO < 1 hr', 'RTO < 24 hrs, RPO < 4 hrs', 'RTO > 24 hrs', 'Untested'],
        weight: 20,
      },
      {
        id: 'SUB-01',
        domain: 'Subcontractor Governance',
        text: 'Do you conduct formal security assessments and bind all sub-processors / fourth parties to equivalent data security obligations?',
        type: 'BOOLEAN',
        required: true,
        weight: 15,
      },
      {
        id: 'COMP-01',
        domain: 'Compliance & Audit',
        text: 'Do you maintain an active SOC 2 Type II or ISO 27001 certification audited by an independent accredited firm?',
        type: 'CHOICE',
        required: true,
        options: ['Yes - SOC 2 Type II and ISO 27001', 'SOC 2 Type II Only', 'ISO 27001 Only', 'None / In Progress'],
        weight: 20,
      },
    ],
  },
  {
    title: 'Standard Cloud Software Assessment (Tier: HIGH / MEDIUM)',
    description: 'Standard due diligence for SaaS, cloud platforms, and software vendors.',
    version: '1.0',
    questions: [
      {
        id: 'SEC-01',
        domain: 'Information Security',
        text: 'Do you implement role-based access control (RBAC) and least-privilege principles across customer tenant data?',
        type: 'BOOLEAN',
        required: true,
        weight: 25,
      },
      {
        id: 'SEC-02',
        domain: 'Information Security',
        text: 'Is customer data logically separated with strict tenant boundary enforcement?',
        type: 'BOOLEAN',
        required: true,
        weight: 25,
      },
      {
        id: 'BCP-01',
        domain: 'Availability & SLAs',
        text: 'What is your uptime commitment and SLA backing service availability?',
        type: 'CHOICE',
        required: true,
        options: ['99.9% or higher with financial credit backing', '99.5% to 99.8%', 'Best effort (<99.5%)'],
        weight: 25,
      },
      {
        id: 'COMP-01',
        domain: 'Compliance',
        text: 'Do you provide an annual third-party security assessment or SOC 2 report upon request?',
        type: 'BOOLEAN',
        required: true,
        weight: 25,
      },
    ],
  },
  {
    title: 'Low-Risk Third-Party Security & Compliance Attestation (Tier: LOW)',
    description: 'Lightweight security attestation and acceptable use confirmation for low-risk vendors.',
    version: '1.0',
    questions: [
      {
        id: 'ATT-01',
        domain: 'General Compliance',
        text: 'Does your organization agree to comply with our Supplier Code of Conduct and Confidentiality Terms?',
        type: 'BOOLEAN',
        required: true,
        weight: 50,
      },
      {
        id: 'ATT-02',
        domain: 'Data Protection',
        text: 'Do you confirm that your employees receive mandatory annual security awareness training?',
        type: 'BOOLEAN',
        required: true,
        weight: 50,
      },
    ],
  },
];
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly resourceAuthService: ResourceAuthorizationService,
    private readonly evidenceService: EvidenceService,
    @Optional() private readonly approvalEngineService?: ApprovalEngineService,
    @Optional() private readonly notificationsService?: NotificationsService,
  ) {}

  async findAll(authCtx: ResourceAuthContext, query: VendorQueryDto): Promise<PaginatedVendorsDto> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);

    const where: any = {
      ...scopeWhere,
      deletedAt: null,
    };

    if (query.criticality) {
      where.criticality = query.criticality;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search && query.search.trim()) {
      const searchTerm = query.search.trim();
      const searchConditions = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { owner: { contains: searchTerm, mode: 'insensitive' } },
        { category: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
      ];

      if (where.OR) {
        where.AND = [
          { OR: where.OR },
          { OR: searchConditions },
        ];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.vendor.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          assessments: true,
          _count: { select: { assets: true, evidenceAssociations: true } },
        },
      }),
      this.prisma.vendor.count({ where }),
    ]);

    return {
      items: items.map(this.mapToDto),
      total,
      page,
      limit,
    };
  }

  async findOne(authCtx: ResourceAuthContext, id: string): Promise<VendorDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const vendor = await this.prisma.vendor.findFirst({
      where: {
        id,
        ...scopeWhere,
        deletedAt: null,
      },
      include: {
        assessments: true,
        _count: { select: { assets: true, evidenceAssociations: true } },
      },
    });

    if (!vendor) {
      throw new NotFoundException(`Vendor with ID "${id}" not found`);
    }

    return this.mapToDto(vendor);
  }

  async create(authCtx: ResourceAuthContext, dto: CreateVendorDto): Promise<VendorDto> {
    await this.resourceAuthService.authorize(authCtx, {
      action: 'WRITE',
      departmentId: dto.departmentId,
      projectId: dto.projectId,
    });

    await this.resourceAuthService.validateHierarchyInvariants(
      authCtx.organizationId,
      dto.departmentId,
      dto.projectId,
    );

    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + (dto.reviewCadenceDays || 365));

    const tprmData: any = {};
    if (dto.businessPurpose) tprmData.businessPurpose = dto.businessPurpose;
    if (dto.serviceProvided) tprmData.serviceProvided = dto.serviceProvided;
    if (dto.countriesOfOperation) tprmData.countriesOfOperation = dto.countriesOfOperation;
    if (dto.dataHandled !== undefined) tprmData.dataHandled = dto.dataHandled;
    if (dto.dataClassification) tprmData.dataClassification = dto.dataClassification;
    if (dto.systemsAccessed) tprmData.systemsAccessed = dto.systemsAccessed;
    if (dto.engagementStartDate) tprmData.engagementStartDate = dto.engagementStartDate;
    if (dto.engagementEndDate) tprmData.engagementEndDate = dto.engagementEndDate;
    if (dto.contractValue !== undefined) tprmData.contractValue = dto.contractValue;
    if (dto.contractRenewalDate) tprmData.contractRenewalDate = dto.contractRenewalDate;
    if (dto.subcontractors) tprmData.subcontractors = dto.subcontractors;
    if (dto.isDraft) tprmData.isDraft = true;

    const initialDueDiligenceStatus = dto.dueDiligenceStatus || (dto.isDraft ? 'DRAFT' : 'ONBOARDING');
    const finalDescription = Object.keys(tprmData).length > 0
      ? encodeVendorDescription(dto.description, tprmData)
      : (dto.description || null);

    const vendor = await this.prisma.vendor.create({
      data: {
        organizationId: authCtx.organizationId,
        departmentId: dto.departmentId || null,
        projectId: dto.projectId || null,
        name: dto.name,
        description: finalDescription,
        category: dto.category || null,
        criticality: dto.criticality || VendorCriticality.MEDIUM,
        status: dto.status || (dto.isDraft ? VendorStatus.UNDER_REVIEW : VendorStatus.ACTIVE),
        owner: dto.owner,
        department: dto.department || null,
        reviewCadenceDays: dto.reviewCadenceDays || 365,
        nextReviewDate,
        websiteUrl: dto.websiteUrl || null,
        dueDiligenceStatus: initialDueDiligenceStatus,
        createdById: authCtx.userId,
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VENDOR_CREATED',
      entityType: 'Vendor',
      entityId: vendor.id,
      metadata: {
        name: vendor.name,
        criticality: vendor.criticality,
        owner: vendor.owner,
        departmentId: vendor.departmentId,
        projectId: vendor.projectId,
      },
    });

    if (this.notificationsService && vendor.owner) {
      await this.notificationsService.notify({
        organizationId: authCtx.organizationId,
        userId: vendor.owner,
        type: NotificationType.TASK_ASSIGNED,
        message: `Vendor "${vendor.name}" has been onboarded/registered.`,
        entityType: 'Vendor',
        entityId: vendor.id,
      });
    }

    return this.mapToDto(vendor);
  }

  async update(authCtx: ResourceAuthContext, id: string, dto: UpdateVendorDto): Promise<VendorDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const existing = await this.prisma.vendor.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Vendor with ID "${id}" not found`);
    }

    if (dto.departmentId !== undefined || dto.projectId !== undefined) {
      const targetDeptId = dto.departmentId !== undefined ? dto.departmentId : existing.departmentId || undefined;
      const targetProjId = dto.projectId !== undefined ? dto.projectId : existing.projectId || undefined;

      await this.resourceAuthService.authorize(authCtx, {
        action: 'WRITE',
        departmentId: targetDeptId,
        projectId: targetProjId,
      });

      await this.resourceAuthService.validateHierarchyInvariants(
        authCtx.organizationId,
        targetDeptId,
        targetProjId,
      );
    }

    const updated = await this.prisma.vendor.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.criticality !== undefined && { criticality: dto.criticality }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.owner !== undefined && { owner: dto.owner }),
        ...(dto.department !== undefined && { department: dto.department }),
        ...(dto.reviewCadenceDays !== undefined && { reviewCadenceDays: dto.reviewCadenceDays }),
        ...(dto.websiteUrl !== undefined && { websiteUrl: dto.websiteUrl }),
        ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
        ...(dto.projectId !== undefined && { projectId: dto.projectId }),
        ...(dto.dueDiligenceStatus !== undefined && { dueDiligenceStatus: dto.dueDiligenceStatus }),
      },
      include: {
        assessments: true,
        _count: { select: { assets: true } },
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VENDOR_UPDATED',
      entityType: 'Vendor',
      entityId: updated.id,
      metadata: {
        name: updated.name,
      },
    });

    return this.mapToDto(updated);
  }

  async softDelete(authCtx: ResourceAuthContext, id: string): Promise<{ success: boolean }> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const existing = await this.prisma.vendor.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Vendor with ID "${id}" not found`);
    }

    await this.prisma.vendor.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VENDOR_DELETED',
      entityType: 'Vendor',
      entityId: existing.id,
      metadata: {
        name: existing.name,
      },
    });

    return { success: true };
  }

  async createAssessment(
    authCtx: ResourceAuthContext,
    vendorId: string,
    dto: CreateVendorAssessmentDto,
  ): Promise<VendorAssessmentDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: vendorId, ...scopeWhere, deletedAt: null },
    });

    if (!vendor) {
      throw new NotFoundException(`Vendor with ID "${vendorId}" not found`);
    }

    const assessment = await this.prisma.vendorAssessment.create({
      data: {
        organizationId: authCtx.organizationId,
        vendorId,
        title: dto.title,
        score: dto.score !== undefined ? dto.score : null,
        status: dto.status || VendorAssessmentStatus.SCHEDULED,
        evaluatorId: dto.evaluatorId,
        riskId: dto.riskId || null,
        complianceTaskId: dto.complianceTaskId || null,
        completedAt: dto.status === VendorAssessmentStatus.COMPLETED ? new Date() : null,
      },
    });

    if (dto.status === VendorAssessmentStatus.COMPLETED) {
      const nextReviewDate = new Date();
      nextReviewDate.setDate(nextReviewDate.getDate() + vendor.reviewCadenceDays);
      await this.prisma.vendor.update({
        where: { id: vendorId },
        data: {
          lastReviewedAt: new Date(),
          nextReviewDate,
        },
      });
    }

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VENDOR_ASSESSMENT_CREATED',
      entityType: 'VendorAssessment',
      entityId: assessment.id,
      metadata: {
        vendorName: vendor.name,
        title: assessment.title,
        status: assessment.status,
      },
    });

    if (this.notificationsService && dto.evaluatorId) {
      await this.notificationsService.notify({
        organizationId: authCtx.organizationId,
        userId: dto.evaluatorId,
        type: NotificationType.TASK_ASSIGNED,
        message: `You have been assigned as evaluator for Vendor Assessment "${assessment.title}" (${vendor.name}).`,
        entityType: 'VendorAssessment',
        entityId: assessment.id,
      });
    }

    return {
      id: assessment.id,
      organizationId: assessment.organizationId,
      vendorId: assessment.vendorId,
      title: assessment.title,
      score: assessment.score,
      status: assessment.status as VendorAssessmentStatus,
      evaluatorId: assessment.evaluatorId,
      riskId: assessment.riskId,
      complianceTaskId: assessment.complianceTaskId,
      completedAt: assessment.completedAt ? assessment.completedAt.toISOString() : null,
      createdAt: assessment.createdAt.toISOString(),
      updatedAt: assessment.updatedAt.toISOString(),
    };
  }

  async migrateAssetVendors(authCtx: ResourceAuthContext): Promise<{ migratedCount: number }> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const assetsWithVendors = await this.prisma.asset.findMany({
      where: {
        ...scopeWhere,
        deletedAt: null,
        vendorName: { not: null },
        vendorId: null,
      },
      select: { id: true, vendorName: true, owner: true },
    });

    let count = 0;
    for (const asset of assetsWithVendors) {
      if (!asset.vendorName || !asset.vendorName.trim()) continue;
      const vName = asset.vendorName.trim();

      let vendor = await this.prisma.vendor.findFirst({
        where: { organizationId: authCtx.organizationId, name: { equals: vName, mode: 'insensitive' }, deletedAt: null },
      });

      if (!vendor) {
        vendor = await this.prisma.vendor.create({
          data: {
            organizationId: authCtx.organizationId,
            name: vName,
            owner: asset.owner || 'System',
            criticality: VendorCriticality.MEDIUM,
            status: VendorStatus.ACTIVE,
            createdById: authCtx.userId,
          },
        });
        count++;
      }

      await this.prisma.asset.update({
        where: { id: asset.id },
        data: { vendorId: vendor.id },
      });
    }

    return { migratedCount: count };
  }

  private mapToDto(vendor: any): VendorDto {
    const { summary, tprm } = decodeVendorDescription(vendor.description);
    return {
      id: vendor.id,
      organizationId: vendor.organizationId,
      departmentId: vendor.departmentId || null,
      projectId: vendor.projectId || null,
      name: vendor.name,
      description: summary || vendor.description,
      category: vendor.category,
      criticality: vendor.criticality as VendorCriticality,
      status: vendor.status as VendorStatus,
      owner: vendor.owner,
      department: vendor.department,
      reviewCadenceDays: vendor.reviewCadenceDays,
      lastReviewedAt: vendor.lastReviewedAt ? (typeof vendor.lastReviewedAt === 'string' ? vendor.lastReviewedAt : vendor.lastReviewedAt.toISOString()) : null,
      nextReviewDate: vendor.nextReviewDate ? (typeof vendor.nextReviewDate === 'string' ? vendor.nextReviewDate : vendor.nextReviewDate.toISOString()) : null,
      websiteUrl: vendor.websiteUrl,
      dueDiligenceStatus: vendor.dueDiligenceStatus || (tprm?.isDraft ? 'DRAFT' : 'ONBOARDING'),
      businessPurpose: tprm?.businessPurpose || null,
      serviceProvided: tprm?.serviceProvided || null,
      countriesOfOperation: tprm?.countriesOfOperation || null,
      dataClassification: tprm?.dataClassification || null,
      systemsAccessed: tprm?.systemsAccessed || null,
      contractValue: tprm?.contractValue || null,
      contractRenewalDate: tprm?.contractRenewalDate || null,
      subcontractors: tprm?.subcontractors || null,
      inherentRisk: tprm?.inherentRisk || null,
      residualRisk: tprm?.residualRisk || null,
      offboarding: tprm?.offboarding || null,
      createdById: vendor.createdById,
      createdAt: vendor.createdAt ? (typeof vendor.createdAt === 'string' ? vendor.createdAt : vendor.createdAt.toISOString()) : new Date().toISOString(),
      updatedAt: vendor.updatedAt ? (typeof vendor.updatedAt === 'string' ? vendor.updatedAt : vendor.updatedAt.toISOString()) : new Date().toISOString(),
      assessments: vendor.assessments ? vendor.assessments.map((a: any) => ({
        id: a.id,
        organizationId: a.organizationId,
        vendorId: a.vendorId,
        title: a.title,
        score: a.score,
        status: a.status as VendorAssessmentStatus,
        evaluatorId: a.evaluatorId,
        riskId: a.riskId,
        complianceTaskId: a.complianceTaskId,
        completedAt: a.completedAt ? (typeof a.completedAt === 'string' ? a.completedAt : a.completedAt.toISOString()) : null,
        createdAt: typeof a.createdAt === 'string' ? a.createdAt : a.createdAt.toISOString(),
        updatedAt: typeof a.updatedAt === 'string' ? a.updatedAt : a.updatedAt.toISOString(),
      })) : [],
      assetCount: vendor._count?.assets || 0,
      documentCount: vendor._count?.evidenceAssociations || 0,
    } as any;
  }

  async getDocuments(
    authCtx: ResourceAuthContext,
    vendorId: string,
    query?: { search?: string; page?: number; limit?: number },
  ): Promise<PaginatedVendorDocumentsDto> {
    // Validate vendor exists and belongs to tenant
    await this.findOne(authCtx, vendorId);

    const joins = await this.prisma.vendorEvidence.findMany({
      where: {
        vendorId,
        organizationId: authCtx.organizationId,
        evidence: {
          deletedAt: null,
        },
      },
      include: {
        evidence: true,
      },
      orderBy: { attachedAt: 'desc' },
    });

    const uploaderIds = Array.from(new Set(joins.map((j) => j.evidence.uploadedById)));
    const users = await this.prisma.user.findMany({
      where: { id: { in: uploaderIds } },
      select: { id: true, name: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.name || u.email]));

    let items: VendorDocumentDto[] = joins.map((j) => {
      const { summary: docSummary, meta: docMeta } = decodeDocDescription(j.evidence.description);
      return {
        id: j.id,
        vendorId: j.vendorId,
        evidenceId: j.evidenceId,
        attachedAt: j.attachedAt.toISOString(),
        title: j.evidence.title,
        description: docSummary || j.evidence.description,
        fileName: j.evidence.fileName,
        fileSize: j.evidence.fileSize,
        mimeType: j.evidence.mimeType,
        status: j.evidence.status as EvidenceStatus,
        scanStatus: j.evidence.scanStatus as EvidenceScanStatus,
        uploadedById: j.evidence.uploadedById,
        uploaderName: userMap.get(j.evidence.uploadedById) || 'Security Team',
        verificationStatus: docMeta?.verificationStatus || 'PENDING_REVIEW',
        documentType: docMeta?.documentType || 'OTHER',
        expiryDate: docMeta?.expiryDate || (j.evidence.retentionUntil ? j.evidence.retentionUntil.toISOString() : null),
        reviewerNotes: docMeta?.reviewerNotes || null,
        rejectionReason: docMeta?.rejectionReason || null,
        verifiedAt: docMeta?.verifiedAt || null,
        verifiedById: docMeta?.verifiedById || null,
      };
    });

    if (query?.search && query.search.trim()) {
      const term = query.search.trim().toLowerCase();
      items = items.filter(
        (i) =>
          i.title.toLowerCase().includes(term) ||
          i.fileName.toLowerCase().includes(term) ||
          (i.description && i.description.toLowerCase().includes(term)),
      );
    }

    return {
      items,
      total: items.length,
    };
  }

  async uploadDocument(
    authCtx: ResourceAuthContext,
    vendorId: string,
    file: any,
    dto: { title?: string; description?: string },
  ): Promise<VendorDocumentDto> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Binary proof file is required for document upload.');
    }

    const vendor = await this.findOne(authCtx, vendorId);

    const evidence = await this.evidenceService.createAndUpload(authCtx, file, {
      title: dto.title?.trim() || file.originalname,
      description: dto.description?.trim(),
      targetResourceType: 'VENDOR',
      targetResourceId: vendorId,
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VENDOR_DOCUMENT_ATTACHED',
      entityType: 'Vendor',
      entityId: vendorId,
      metadata: {
        vendorName: vendor.name,
        evidenceId: evidence.id,
        fileName: file.originalname,
        fileSize: file.size || file.buffer.length,
      },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: authCtx.userId },
      select: { name: true, email: true },
    });

    return {
      id: `ve-${evidence.id}`,
      vendorId,
      evidenceId: evidence.id,
      attachedAt: new Date().toISOString(),
      title: evidence.title,
      description: evidence.description,
      fileName: evidence.fileName,
      fileSize: evidence.fileSize,
      mimeType: evidence.mimeType,
      status: evidence.status as EvidenceStatus,
      scanStatus: evidence.scanStatus as EvidenceScanStatus,
      uploadedById: authCtx.userId,
      uploaderName: user?.name || user?.email || 'Security Team',
    };
  }

  async removeDocument(
    authCtx: ResourceAuthContext,
    vendorId: string,
    evidenceId: string,
  ): Promise<{ success: boolean; evidenceId: string }> {
    const vendor = await this.findOne(authCtx, vendorId);

    const assoc = await this.prisma.vendorEvidence.findFirst({
      where: {
        vendorId,
        evidenceId,
        organizationId: authCtx.organizationId,
      },
    });

    if (!assoc) {
      throw new NotFoundException(`Document "${evidenceId}" is not attached to vendor "${vendorId}".`);
    }

    await this.evidenceService.detachEvidence(authCtx, evidenceId, 'VENDOR', vendorId);

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VENDOR_DOCUMENT_REMOVED',
      entityType: 'Vendor',
      entityId: vendorId,
      metadata: {
        vendorName: vendor.name,
        evidenceId,
      },
    });

    return { success: true, evidenceId };
  }

  async downloadDocument(
    authCtx: ResourceAuthContext,
    vendorId: string,
    evidenceId: string,
    res: any,
  ): Promise<void> {
    await this.findOne(authCtx, vendorId);

    const assoc = await this.prisma.vendorEvidence.findFirst({
      where: {
        vendorId,
        evidenceId,
        organizationId: authCtx.organizationId,
      },
    });

    if (!assoc) {
      throw new NotFoundException(`Document "${evidenceId}" is not attached to vendor "${vendorId}".`);
    }

    await this.evidenceService.downloadEvidence(authCtx, evidenceId, res);
  }

  // --- VENDOR QUESTIONNAIRES (DEFINITIONS) ---

  async createQuestionnaire(authCtx: ResourceAuthContext, dto: CreateVendorQuestionnaireDto): Promise<VendorQuestionnaireDto> {
    const questionnaire = await this.prisma.vendorQuestionnaire.create({
      data: {
        organizationId: authCtx.organizationId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        version: dto.version || '1.0',
        status: 'PUBLISHED',
        questions: dto.questions || [],
        createdById: authCtx.userId,
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VENDOR_QUESTIONNAIRE_CREATED',
      entityType: 'VendorQuestionnaire',
      entityId: questionnaire.id,
      metadata: { title: questionnaire.title, version: questionnaire.version },
    });

    return {
      id: questionnaire.id,
      organizationId: questionnaire.organizationId,
      title: questionnaire.title,
      description: questionnaire.description,
      version: questionnaire.version,
      status: questionnaire.status,
      questions: questionnaire.questions as any,
      createdById: questionnaire.createdById,
      createdAt: questionnaire.createdAt.toISOString(),
      updatedAt: questionnaire.updatedAt.toISOString(),
    };
  }

  async getQuestionnaires(authCtx: ResourceAuthContext): Promise<VendorQuestionnaireDto[]> {
    let items = await this.prisma.vendorQuestionnaire.findMany({
      where: { organizationId: authCtx.organizationId },
      orderBy: { createdAt: 'desc' },
    });

    if (items.length === 0) {
      // Auto-seed standardized TPRM templates for this tenant
      for (const tpl of STANDARD_TPRM_TEMPLATES) {
        await this.prisma.vendorQuestionnaire.create({
          data: {
            organizationId: authCtx.organizationId,
            title: tpl.title,
            description: tpl.description,
            version: tpl.version,
            status: 'ACTIVE',
            questions: tpl.questions as any,
            createdById: authCtx.userId,
          },
        });
      }
      items = await this.prisma.vendorQuestionnaire.findMany({
        where: { organizationId: authCtx.organizationId },
        orderBy: { createdAt: 'desc' },
      });
    }

    return items.map((q) => ({
      id: q.id,
      organizationId: q.organizationId,
      title: q.title,
      description: q.description,
      version: q.version,
      status: q.status,
      questions: q.questions as any,
      createdById: q.createdById,
      createdAt: q.createdAt.toISOString(),
      updatedAt: q.updatedAt.toISOString(),
    }));
  }

  async getQuestionnaireById(authCtx: ResourceAuthContext, id: string): Promise<VendorQuestionnaireDto> {
    const q = await this.prisma.vendorQuestionnaire.findFirst({
      where: { id, organizationId: authCtx.organizationId },
    });
    if (!q) throw new NotFoundException(`Questionnaire "${id}" not found.`);

    return {
      id: q.id,
      organizationId: q.organizationId,
      title: q.title,
      description: q.description,
      version: q.version,
      status: q.status,
      questions: q.questions as any,
      createdById: q.createdById,
      createdAt: q.createdAt.toISOString(),
      updatedAt: q.updatedAt.toISOString(),
    };
  }

  async updateQuestionnaire(authCtx: ResourceAuthContext, id: string, dto: UpdateVendorQuestionnaireDto): Promise<VendorQuestionnaireDto> {
    const existing = await this.prisma.vendorQuestionnaire.findFirst({
      where: { id, organizationId: authCtx.organizationId },
    });
    if (!existing) throw new NotFoundException(`Questionnaire "${id}" not found.`);

    const updated = await this.prisma.vendorQuestionnaire.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
        ...(dto.version !== undefined && { version: dto.version }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.questions !== undefined && { questions: dto.questions }),
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VENDOR_QUESTIONNAIRE_UPDATED',
      entityType: 'VendorQuestionnaire',
      entityId: updated.id,
      metadata: { title: updated.title, status: updated.status },
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      title: updated.title,
      description: updated.description,
      version: updated.version,
      status: updated.status,
      questions: updated.questions as any,
      createdById: updated.createdById,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  // --- VENDOR QUESTIONNAIRE SUBMISSIONS & RESPONSES ---

  async submitQuestionnaire(
    authCtx: ResourceAuthContext,
    vendorId: string,
    dto: SubmitVendorQuestionnaireDto,
  ): Promise<VendorQuestionnaireSubmissionDto> {
    await this.findOne(authCtx, vendorId);

    const questionnaire = await this.prisma.vendorQuestionnaire.findFirst({
      where: { id: dto.questionnaireId, organizationId: authCtx.organizationId },
    });
    if (!questionnaire) throw new NotFoundException(`Questionnaire "${dto.questionnaireId}" not found.`);

    if (dto.assessmentId) {
      const assessment = await this.prisma.vendorAssessment.findFirst({
        where: { id: dto.assessmentId, vendorId, organizationId: authCtx.organizationId },
      });
      if (!assessment) throw new NotFoundException(`Assessment "${dto.assessmentId}" not found for vendor.`);
    }

    const submission = await this.prisma.vendorQuestionnaireSubmission.create({
      data: {
        organizationId: authCtx.organizationId,
        vendorId,
        questionnaireId: dto.questionnaireId,
        assessmentId: dto.assessmentId || null,
        answers: dto.answers || {},
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
      include: {
        questionnaire: { select: { title: true, version: true } },
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VENDOR_QUESTIONNAIRE_SUBMITTED',
      entityType: 'VendorQuestionnaireSubmission',
      entityId: submission.id,
      metadata: { vendorId, questionnaireId: dto.questionnaireId, status: submission.status },
    });

    if (this.notificationsService) {
      const vendor = await this.prisma.vendor.findUnique({
        where: { id: vendorId },
        select: { owner: true, name: true },
      });
      if (vendor?.owner) {
        await this.notificationsService.notify({
          organizationId: authCtx.organizationId,
          userId: vendor.owner,
          type: NotificationType.TASK_ASSIGNED,
          message: `Questionnaire "${submission.questionnaire.title}" submitted for vendor "${vendor.name}".`,
          entityType: 'VendorQuestionnaireSubmission',
          entityId: submission.id,
        });
      }
    }

    return {
      id: submission.id,
      organizationId: submission.organizationId,
      vendorId: submission.vendorId,
      questionnaireId: submission.questionnaireId,
      questionnaireTitle: submission.questionnaire.title,
      questionnaireVersion: submission.questionnaire.version,
      assessmentId: submission.assessmentId,
      status: submission.status,
      answers: submission.answers as any,
      score: submission.score,
      submittedAt: submission.submittedAt ? submission.submittedAt.toISOString() : null,
      reviewedAt: submission.reviewedAt ? submission.reviewedAt.toISOString() : null,
      reviewedById: submission.reviewedById,
      reviewNotes: submission.reviewNotes,
      createdAt: submission.createdAt.toISOString(),
      updatedAt: submission.updatedAt.toISOString(),
    };
  }

  async getQuestionnaireSubmissions(authCtx: ResourceAuthContext, vendorId: string): Promise<VendorQuestionnaireSubmissionDto[]> {
    await this.findOne(authCtx, vendorId);

    const submissions = await this.prisma.vendorQuestionnaireSubmission.findMany({
      where: { vendorId, organizationId: authCtx.organizationId },
      include: { questionnaire: { select: { title: true, version: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return submissions.map((s) => ({
      id: s.id,
      organizationId: s.organizationId,
      vendorId: s.vendorId,
      questionnaireId: s.questionnaireId,
      questionnaireTitle: s.questionnaire.title,
      questionnaireVersion: s.questionnaire.version,
      assessmentId: s.assessmentId,
      status: s.status,
      answers: s.answers as any,
      score: s.score,
      submittedAt: s.submittedAt ? s.submittedAt.toISOString() : null,
      reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
      reviewedById: s.reviewedById,
      reviewNotes: s.reviewNotes,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));
  }

  async reviewQuestionnaireSubmission(
    authCtx: ResourceAuthContext,
    vendorId: string,
    submissionId: string,
    dto: ReviewVendorQuestionnaireSubmissionDto,
  ): Promise<VendorQuestionnaireSubmissionDto> {
    await this.findOne(authCtx, vendorId);

    const existing = await this.prisma.vendorQuestionnaireSubmission.findFirst({
      where: { id: submissionId, vendorId, organizationId: authCtx.organizationId },
      include: { questionnaire: { select: { title: true, version: true } } },
    });
    if (!existing) throw new NotFoundException(`Submission "${submissionId}" not found for vendor.`);

    const updated = await this.prisma.vendorQuestionnaireSubmission.update({
      where: { id: submissionId },
      data: {
        status: dto.status,
        ...(dto.score !== undefined && { score: dto.score }),
        ...(dto.reviewNotes !== undefined && { reviewNotes: dto.reviewNotes }),
        reviewedById: authCtx.userId,
        reviewedAt: new Date(),
      },
      include: { questionnaire: { select: { title: true, version: true } } },
    });

    if (dto.status === 'ACCEPTED') {
      await this.prisma.vendor.update({
        where: { id: vendorId },
        data: {
          dueDiligenceStatus: 'APPROVED',
          lastReviewedAt: new Date(),
        },
      });
    }

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VENDOR_QUESTIONNAIRE_REVIEWED',
      entityType: 'VendorQuestionnaireSubmission',
      entityId: updated.id,
      metadata: { vendorId, status: updated.status, score: updated.score },
    });

    if (this.notificationsService) {
      const vendor = await this.prisma.vendor.findUnique({
        where: { id: vendorId },
        select: { owner: true, name: true },
      });
      if (vendor?.owner) {
        await this.notificationsService.notify({
          organizationId: authCtx.organizationId,
          userId: vendor.owner,
          type: NotificationType.TASK_ASSIGNED,
          message: `Questionnaire "${updated.questionnaire.title}" for vendor "${vendor.name}" reviewed: status ${updated.status}.`,
          entityType: 'VendorQuestionnaireSubmission',
          entityId: updated.id,
        });
      }
    }

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      vendorId: updated.vendorId,
      questionnaireId: updated.questionnaireId,
      questionnaireTitle: updated.questionnaire.title,
      questionnaireVersion: updated.questionnaire.version,
      assessmentId: updated.assessmentId,
      status: updated.status,
      answers: updated.answers as any,
      score: updated.score,
      submittedAt: updated.submittedAt ? updated.submittedAt.toISOString() : null,
      reviewedAt: updated.reviewedAt ? updated.reviewedAt.toISOString() : null,
      reviewedById: updated.reviewedById,
      reviewNotes: updated.reviewNotes,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  // --- VENDOR ASSESSMENT ACTIONS (REMEDIATION) ---

  async createAssessmentAction(
    authCtx: ResourceAuthContext,
    vendorId: string,
    assessmentId: string,
    dto: CreateVendorAssessmentActionDto,
  ): Promise<VendorAssessmentActionDto> {
    await this.findOne(authCtx, vendorId);

    const assessment = await this.prisma.vendorAssessment.findFirst({
      where: { id: assessmentId, vendorId, organizationId: authCtx.organizationId },
    });
    if (!assessment) throw new NotFoundException(`Assessment "${assessmentId}" not found for vendor.`);

    const action = await this.prisma.vendorAssessmentAction.create({
      data: {
        organizationId: authCtx.organizationId,
        assessmentId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        actionType: (dto as any).actionType || 'REMEDIATION',
        owner: dto.owner.trim(),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        status: (dto.status as any) || 'OPEN',
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VENDOR_ASSESSMENT_ACTION_CREATED',
      entityType: 'VendorAssessmentAction',
      entityId: action.id,
      metadata: { vendorId, assessmentId, title: action.title },
    });

    return {
      id: action.id,
      organizationId: action.organizationId,
      assessmentId: action.assessmentId,
      title: action.title,
      description: action.description,
      actionType: action.actionType,
      owner: action.owner,
      dueDate: action.dueDate ? action.dueDate.toISOString() : null,
      status: action.status,
      completedAt: action.completedAt ? action.completedAt.toISOString() : null,
      createdAt: action.createdAt.toISOString(),
      updatedAt: action.updatedAt.toISOString(),
    };
  }

  async getAssessmentActions(
    authCtx: ResourceAuthContext,
    vendorId: string,
    assessmentId: string,
  ): Promise<VendorAssessmentActionDto[]> {
    await this.findOne(authCtx, vendorId);

    const assessment = await this.prisma.vendorAssessment.findFirst({
      where: { id: assessmentId, vendorId, organizationId: authCtx.organizationId },
    });
    if (!assessment) throw new NotFoundException(`Assessment "${assessmentId}" not found for vendor.`);

    const actions = await this.prisma.vendorAssessmentAction.findMany({
      where: { assessmentId, organizationId: authCtx.organizationId },
      orderBy: { createdAt: 'desc' },
    });

    return actions.map((a) => ({
      id: a.id,
      organizationId: a.organizationId,
      assessmentId: a.assessmentId,
      title: a.title,
      description: a.description,
      actionType: a.actionType,
      owner: a.owner,
      dueDate: a.dueDate ? a.dueDate.toISOString() : null,
      status: a.status,
      completedAt: a.completedAt ? a.completedAt.toISOString() : null,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));
  }

  async updateAssessmentAction(
    authCtx: ResourceAuthContext,
    vendorId: string,
    assessmentId: string,
    actionId: string,
    dto: UpdateVendorAssessmentActionDto,
  ): Promise<VendorAssessmentActionDto> {
    await this.findOne(authCtx, vendorId);

    const existing = await this.prisma.vendorAssessmentAction.findFirst({
      where: { id: actionId, assessmentId, organizationId: authCtx.organizationId },
    });
    if (!existing) throw new NotFoundException(`Action "${actionId}" not found on assessment.`);

    const completedAt = (dto.status === 'COMPLETED' || dto.status === 'CLOSED')
      ? (existing.completedAt || new Date())
      : (dto.status ? null : existing.completedAt);

    const updated = await this.prisma.vendorAssessmentAction.update({
      where: { id: actionId },
      data: {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
        ...(dto.owner !== undefined && { owner: dto.owner.trim() }),
        ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
        ...(dto.status !== undefined && { status: dto.status as any }),
        completedAt,
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VENDOR_ASSESSMENT_ACTION_UPDATED',
      entityType: 'VendorAssessmentAction',
      entityId: updated.id,
      metadata: { vendorId, assessmentId, status: updated.status },
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      assessmentId: updated.assessmentId,
      title: updated.title,
      description: updated.description,
      actionType: updated.actionType,
      owner: updated.owner,
      dueDate: updated.dueDate ? updated.dueDate.toISOString() : null,
      status: updated.status,
      completedAt: updated.completedAt ? updated.completedAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteAssessmentAction(
    authCtx: ResourceAuthContext,
    vendorId: string,
    assessmentId: string,
    actionId: string,
  ): Promise<{ success: boolean }> {
    await this.findOne(authCtx, vendorId);

    await this.prisma.vendorAssessmentAction.deleteMany({
      where: { id: actionId, assessmentId, organizationId: authCtx.organizationId },
    });

    return { success: true };
  }

  // --- APPROVAL WORKFLOW INTEGRATION ---

  async submitAssessmentForApproval(
    authCtx: ResourceAuthContext,
    vendorId: string,
    assessmentId: string,
    dto: SubmitVendorAssessmentApprovalDto,
  ) {
    const vendor = await this.findOne(authCtx, vendorId);

    const assessment = await this.prisma.vendorAssessment.findFirst({
      where: { id: assessmentId, vendorId, organizationId: authCtx.organizationId },
    });
    if (!assessment) throw new NotFoundException(`Assessment "${assessmentId}" not found for vendor.`);

    if (!this.approvalEngineService) {
      throw new BadRequestException('Approval engine service is not available.');
    }

    const title = dto.title?.trim() || `Vendor Assessment Approval: ${vendor.name} - ${assessment.title}`;
    const instance = await this.approvalEngineService.createApprovalInstance(
      authCtx.organizationId,
      authCtx.userId,
      {
        title,
        description: `Approval for vendor risk assessment "${assessment.title}" (Score: ${assessment.score ?? 'N/A'})`,
        resourceType: 'VENDOR_ASSESSMENT',
        resourceId: assessment.id,
        workflowId: dto.workflowId,
        purpose: 'VENDOR_APPROVAL' as any,
        dueDays: dto.dueDays || 7,
      },
    );

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VENDOR_ASSESSMENT_APPROVAL_SUBMITTED',
      entityType: 'VendorAssessment',
      entityId: assessment.id,
      metadata: { approvalInstanceId: instance.id, vendorId },
    });

    return instance;
  }
  // --- TPRM LIFECYCLE EXTENSIONS ---

  /**
   * Evaluates and records the inherent risk for a vendor prior to due diligence.
   */
  async assessInherentRisk(
    authCtx: ResourceAuthContext,
    vendorId: string,
    dto: AssessInherentRiskDto,
  ): Promise<InherentRiskAssessmentResultDto> {
    const vendor = await this.findOne(authCtx, vendorId);

    const f = dto.factors;
    const scores: Record<string, number> = {
      dataSensitivity: f.dataSensitivity === 'RESTRICTED' ? 100 : f.dataSensitivity === 'CONFIDENTIAL' ? 70 : f.dataSensitivity === 'INTERNAL' ? 25 : 0,
      systemAccess: f.systemAccess === 'PRIVILEGED_ADMIN' ? 100 : f.systemAccess === 'DIRECT_API' ? 70 : f.systemAccess === 'BATCH' ? 30 : 0,
      businessCriticality: f.businessCriticality === 'MISSION_CRITICAL' ? 100 : f.businessCriticality === 'SIGNIFICANT' ? 75 : f.businessCriticality === 'OPERATIONAL_SUPPORT' ? 40 : 10,
      dataVolume: f.dataVolume === 'MASSIVE' ? 100 : f.dataVolume === 'LARGE' ? 80 : f.dataVolume === 'MODERATE' ? 40 : 10,
      financialExposure: f.financialExposure === 'VERY_HIGH' ? 100 : f.financialExposure === 'HIGH' ? 70 : f.financialExposure === 'MEDIUM' ? 30 : 10,
      regulatoryExposure: f.regulatoryExposure === 'HIGH' ? 100 : f.regulatoryExposure === 'MODERATE' ? 60 : f.regulatoryExposure === 'LOW' ? 30 : 0,
      subcontractorReliance: f.subcontractorReliance === 'HEAVY' ? 100 : f.subcontractorReliance === 'MODERATE' ? 60 : f.subcontractorReliance === 'LOW' ? 30 : 0,
    };

    const weights: Record<string, number> = {
      dataSensitivity: 0.20,
      systemAccess: 0.20,
      businessCriticality: 0.20,
      dataVolume: 0.10,
      financialExposure: 0.10,
      regulatoryExposure: 0.10,
      subcontractorReliance: 0.10,
    };

    let calculatedScore = 0;
    const factorBreakdown: Record<string, any> = {};

    for (const [key, weight] of Object.entries(weights)) {
      const score = scores[key] || 0;
      const contribution = Math.round(score * weight);
      calculatedScore += contribution;
      factorBreakdown[key] = {
        value: (f as any)[key],
        score,
        weight,
        contribution,
      };
    }

    let tier: VendorCriticality = VendorCriticality.LOW;
    let reviewCadenceDays = 730;
    let recommendedDueDiligence = 'Lightweight Third-Party Compliance & Basic Security Attestation.';

    if (calculatedScore >= 75) {
      tier = VendorCriticality.CRITICAL;
      reviewCadenceDays = 180;
      recommendedDueDiligence = 'Comprehensive Security, Privacy, BCP/DR, and Subcontractor Governance review with executive sign-off.';
    } else if (calculatedScore >= 50) {
      tier = VendorCriticality.HIGH;
      reviewCadenceDays = 365;
      recommendedDueDiligence = 'In-depth Security, Privacy, and Continuity review with Information Security sign-off.';
    } else if (calculatedScore >= 25) {
      tier = VendorCriticality.MEDIUM;
      reviewCadenceDays = 365;
      recommendedDueDiligence = 'Standard Security and Compliance questionnaire with SOC 2 / ISO verification.';
    }

    if (dto.overrideTier) {
      tier = dto.overrideTier;
    }

    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + reviewCadenceDays);

    const result: InherentRiskAssessmentResultDto = {
      score: calculatedScore,
      tier,
      factors: factorBreakdown,
      rationale: `Inherent risk evaluated at ${calculatedScore}/100 resulting in tier ${tier}. Key drivers: Data Sensitivity (${f.dataSensitivity}), System Access (${f.systemAccess}), and Business Criticality (${f.businessCriticality}).`,
      recommendedDueDiligence,
      suggestedReviewCadenceDays: reviewCadenceDays,
      assessedAt: new Date().toISOString(),
      assessedBy: authCtx.userId,
    };

    const existingVendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    const { summary, tprm } = decodeVendorDescription(existingVendor?.description);
    const updatedTprm = { ...(tprm || {}), inherentRisk: result };
    const updatedDesc = encodeVendorDescription(summary, updatedTprm);

    await this.prisma.vendor.update({
      where: { id: vendorId },
      data: {
        criticality: tier,
        reviewCadenceDays,
        nextReviewDate,
        dueDiligenceStatus: 'INHERENT_RISK_ASSESSED',
        description: updatedDesc,
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VENDOR_INHERENT_RISK_ASSESSED',
      entityType: 'Vendor',
      entityId: vendorId,
      metadata: {
        score: calculatedScore,
        tier,
        reviewCadenceDays,
        override: !!dto.overrideTier,
      },
    });

    return result;
  }

  /**
   * Triggers tiered due diligence based on the vendor's inherent risk tier.
   */
  async triggerDueDiligence(
    authCtx: ResourceAuthContext,
    vendorId: string,
  ): Promise<{ assessment: VendorAssessmentDto; questionnaire: VendorQuestionnaireDto; submission: VendorQuestionnaireSubmissionDto }> {
    const vendor = await this.findOne(authCtx, vendorId);

    // Get or seed questionnaires
    const questionnaires = await this.getQuestionnaires(authCtx);

    let targetTemplate = questionnaires.find((q) => {
      if (vendor.criticality === VendorCriticality.CRITICAL) return q.title.includes('Critical');
      if (vendor.criticality === VendorCriticality.HIGH) return q.title.includes('Standard');
      if (vendor.criticality === VendorCriticality.MEDIUM) return q.title.includes('Standard');
      return q.title.includes('Low-Risk');
    }) || questionnaires[0];

    // Create an assessment record
    const assessment = await this.createAssessment(authCtx, vendorId, {
      title: `Due Diligence Assessment — ${vendor.criticality} Tier`,
      status: VendorAssessmentStatus.IN_PROGRESS,
      evaluatorId: authCtx.userId,
      score: undefined,
    });

    // Create a pending questionnaire submission
    const submission = await this.submitQuestionnaire(authCtx, vendorId, {
      questionnaireId: targetTemplate.id,
      assessmentId: assessment.id,
      answers: [],
    });

    await this.prisma.vendor.update({
      where: { id: vendorId },
      data: { dueDiligenceStatus: 'DUE_DILIGENCE' },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VENDOR_DUE_DILIGENCE_TRIGGERED',
      entityType: 'Vendor',
      entityId: vendorId,
      metadata: { assessmentId: assessment.id, questionnaireId: targetTemplate.id, tier: vendor.criticality },
    });

    return { assessment, questionnaire: targetTemplate, submission };
  }

  /**
   * Verifies an uploaded vendor document, tracks expiry date, and records review feedback.
   */
  async verifyDocument(
    authCtx: ResourceAuthContext,
    vendorId: string,
    evidenceId: string,
    dto: VerifyVendorDocumentDto,
  ): Promise<VendorDocumentDto> {
    await this.findOne(authCtx, vendorId);

    const join = await this.prisma.vendorEvidence.findFirst({
      where: { vendorId, evidenceId, organizationId: authCtx.organizationId },
      include: { evidence: true },
    });

    if (!join) {
      throw new NotFoundException(`Document "${evidenceId}" not associated with vendor "${vendorId}".`);
    }

    if (dto.verificationStatus === 'REJECTED' && (!dto.rejectionReason || dto.rejectionReason.trim().length < 5)) {
      throw new BadRequestException('A specific rejection reason is required when rejecting vendor documents.');
    }

    const { summary } = decodeDocDescription(join.evidence.description);
    const docMeta = {
      verificationStatus: dto.verificationStatus,
      documentType: dto.documentType || 'OTHER',
      expiryDate: dto.expiryDate || null,
      reviewerNotes: dto.reviewerNotes || null,
      rejectionReason: dto.rejectionReason || null,
      verifiedAt: new Date().toISOString(),
      verifiedById: authCtx.userId,
    };

    const newDescription = encodeDocDescription(summary || join.evidence.title, docMeta);
    const retentionUntil = dto.expiryDate ? new Date(dto.expiryDate) : join.evidence.retentionUntil;

    await this.prisma.evidence.update({
      where: { id: evidenceId },
      data: {
        description: newDescription,
        retentionUntil,
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: dto.verificationStatus === 'VERIFIED' ? 'VENDOR_DOCUMENT_VERIFIED' : 'VENDOR_DOCUMENT_REJECTED',
      entityType: 'VendorEvidence',
      entityId: join.id,
      metadata: {
        vendorId,
        evidenceId,
        verificationStatus: dto.verificationStatus,
        documentType: dto.documentType,
        expiryDate: dto.expiryDate,
      },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: authCtx.userId },
      select: { name: true, email: true },
    });

    return {
      id: join.id,
      vendorId,
      evidenceId,
      attachedAt: join.attachedAt.toISOString(),
      title: join.evidence.title,
      description: summary || join.evidence.title,
      fileName: join.evidence.fileName,
      fileSize: join.evidence.fileSize,
      mimeType: join.evidence.mimeType,
      status: join.evidence.status as EvidenceStatus,
      scanStatus: join.evidence.scanStatus as EvidenceScanStatus,
      uploadedById: join.evidence.uploadedById,
      uploaderName: user?.name || user?.email || 'Security Reviewer',
      verificationStatus: dto.verificationStatus,
      documentType: dto.documentType || 'OTHER',
      expiryDate: dto.expiryDate || null,
      reviewerNotes: dto.reviewerNotes || null,
      rejectionReason: dto.rejectionReason || null,
      verifiedAt: docMeta.verifiedAt,
      verifiedById: authCtx.userId,
    };
  }

  /**
   * Evaluates control effectiveness and computes the residual risk posture for a vendor.
   */
  async calculateResidualRisk(
    authCtx: ResourceAuthContext,
    vendorId: string,
    dto: CalculateResidualRiskDto,
  ): Promise<ResidualRiskEvaluationResultDto> {
    const vendor = await this.findOne(authCtx, vendorId);

    // 1. Resolve Inherent Risk Score
    let inherentScore = vendor.inherentRisk?.score;
    if (!inherentScore) {
      inherentScore = vendor.criticality === VendorCriticality.CRITICAL ? 85
        : vendor.criticality === VendorCriticality.HIGH ? 65
        : vendor.criticality === VendorCriticality.MEDIUM ? 40
        : 15;
    }

    // 2. Resolve Control Effectiveness from Assessment / Questionnaires & Documents
    let questionnaireScore = 75; // Default moderate baseline if submission pending
    const submissions = await this.getQuestionnaireSubmissions(authCtx, vendorId);
    if (submissions.length > 0 && submissions[0].score !== null && submissions[0].score !== undefined) {
      questionnaireScore = submissions[0].score;
    }

    const docs = await this.getDocuments(authCtx, vendorId, {});
    const verifiedDocs = docs.items.filter((d) => d.verificationStatus === 'VERIFIED');
    const docRatio = docs.items.length > 0 ? (verifiedDocs.length / docs.items.length) * 100 : 50;

    let controlEffectiveness = dto.overrideControlEffectiveness !== undefined
      ? dto.overrideControlEffectiveness
      : Math.round(questionnaireScore * 0.70 + docRatio * 0.30);

    controlEffectiveness = Math.max(0, Math.min(100, controlEffectiveness));

    // Residual Risk = Inherent * (1 - (Effectiveness * 0.70))
    const residualRiskScore = Math.max(10, Math.round(inherentScore * (1 - (controlEffectiveness / 100) * 0.70)));

    let residualTier: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (residualRiskScore >= 70) residualTier = 'CRITICAL';
    else if (residualRiskScore >= 45) residualTier = 'HIGH';
    else if (residualRiskScore >= 20) residualTier = 'MEDIUM';

    // Check actions / findings
    let openFindings = 0;
    let resolvedFindings = 0;
    if (vendor.assessments && vendor.assessments.length > 0) {
      const actions = await this.getAssessmentActions(authCtx, vendorId, vendor.assessments[0].id);
      openFindings = actions.filter((a) => a.status === 'OPEN' || a.status === 'IN_PROGRESS').length;
      resolvedFindings = actions.filter((a) => a.status === 'RESOLVED' || a.status === 'CLOSED').length;
    }

    const mitigatingControls = [
      'Multi-Factor Authentication (MFA) on administrative gateways',
      'End-to-end data encryption at rest (AES-256) and in transit (TLS 1.3)',
      'Subcontractor security due diligence and DPA binding',
      'Annual SOC 2 Type II independent verification',
    ];

    const result: ResidualRiskEvaluationResultDto = {
      inherentRiskScore: inherentScore,
      inherentRiskTier: vendor.criticality,
      controlEffectivenessScore: controlEffectiveness,
      residualRiskScore,
      residualRiskTier: residualTier,
      justification: `Inherent risk ${inherentScore}/100 mitigated by ${controlEffectiveness}% evaluated vendor controls to reach residual risk score ${residualRiskScore}/100 (${residualTier} tier).`,
      mitigatingControls,
      findingsSummary: {
        total: openFindings + resolvedFindings,
        open: openFindings,
        resolved: resolvedFindings,
      },
      evaluatedAt: new Date().toISOString(),
      evaluatedBy: authCtx.userId,
    };

    const existingVendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    const { summary, tprm } = decodeVendorDescription(existingVendor?.description);
    const updatedTprm = { ...(tprm || {}), residualRisk: result };
    const updatedDesc = encodeVendorDescription(summary, updatedTprm);

    await this.prisma.vendor.update({
      where: { id: vendorId },
      data: {
        dueDiligenceStatus: 'RISK_EVALUATION',
        description: updatedDesc,
      },
    });

    if (vendor.assessments && vendor.assessments.length > 0) {
      await this.prisma.vendorAssessment.update({
        where: { id: vendor.assessments[0].id },
        data: {
          score: controlEffectiveness,
          status: VendorAssessmentStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
    }

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VENDOR_RESIDUAL_RISK_CALCULATED',
      entityType: 'Vendor',
      entityId: vendorId,
      metadata: {
        inherentScore,
        controlEffectiveness,
        residualRiskScore,
        residualTier,
      },
    });

    return result;
  }

  /**
   * Verifies closure of an assessment remediation action or rejects inadequate corrective evidence to reopen it.
   */
  async verifyAssessmentAction(
    authCtx: ResourceAuthContext,
    vendorId: string,
    assessmentId: string,
    actionId: string,
    dto: VerifyVendorAssessmentActionDto,
  ): Promise<VendorAssessmentActionDto> {
    await this.findOne(authCtx, vendorId);

    const existing = await this.prisma.vendorAssessmentAction.findFirst({
      where: { id: actionId, assessmentId, organizationId: authCtx.organizationId },
    });
    if (!existing) throw new NotFoundException(`Action "${actionId}" not found on assessment.`);

    if (dto.verified === true) {
      const updated = await this.prisma.vendorAssessmentAction.update({
        where: { id: actionId },
        data: {
          status: 'RESOLVED' as any,
          completedAt: new Date(),
          description: dto.verificationNotes
            ? `${existing.description || ''}\n[VERIFIED - ${new Date().toISOString()}]: ${dto.verificationNotes}`.trim()
            : existing.description,
        },
      });

      await this.auditLogsService.log({
        organizationId: authCtx.organizationId,
        actorId: authCtx.userId,
        action: 'VENDOR_ACTION_VERIFIED_CLOSED',
        entityType: 'VendorAssessmentAction',
        entityId: actionId,
        metadata: { vendorId, assessmentId, verified: true },
      });

      return {
        id: updated.id,
        organizationId: updated.organizationId,
        assessmentId: updated.assessmentId,
        title: updated.title,
        description: updated.description,
        actionType: updated.actionType,
        owner: updated.owner,
        dueDate: updated.dueDate ? updated.dueDate.toISOString() : null,
        status: updated.status,
        completedAt: updated.completedAt ? updated.completedAt.toISOString() : null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    } else {
      if (!dto.rejectionReason || dto.rejectionReason.trim().length < 5) {
        throw new BadRequestException('A specific rejection reason is required when rejecting corrective evidence.');
      }

      const appendMsg = `\n[REOPENED_REJECTED - ${new Date().toISOString()} by ${authCtx.userId}]: ${dto.rejectionReason}`;
      const newDescription = (existing.description || '') + appendMsg;

      const updated = await this.prisma.vendorAssessmentAction.update({
        where: { id: actionId },
        data: {
          status: 'IN_PROGRESS' as any,
          completedAt: null,
          description: newDescription.trim(),
        },
      });

      await this.auditLogsService.log({
        organizationId: authCtx.organizationId,
        actorId: authCtx.userId,
        action: 'VENDOR_ACTION_VERIFICATION_REJECTED',
        entityType: 'VendorAssessmentAction',
        entityId: actionId,
        metadata: { vendorId, assessmentId, rejectionReason: dto.rejectionReason },
      });

      return {
        id: updated.id,
        organizationId: updated.organizationId,
        assessmentId: updated.assessmentId,
        title: updated.title,
        description: updated.description,
        actionType: updated.actionType,
        owner: updated.owner,
        dueDate: updated.dueDate ? updated.dueDate.toISOString() : null,
        status: updated.status,
        completedAt: null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    }
  }

  /**
   * Approves or rejects the vendor relationship with formal audit sign-off.
   */
  async approveRelationship(
    authCtx: ResourceAuthContext,
    vendorId: string,
    dto: ApproveVendorRelationshipDto,
  ): Promise<VendorDto> {
    const vendor = await this.findOne(authCtx, vendorId);

    const now = new Date();
    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + (vendor.reviewCadenceDays || 365));

    const updated = await this.prisma.vendor.update({
      where: { id: vendorId },
      data: {
        status: dto.approved ? VendorStatus.ACTIVE : VendorStatus.INACTIVE,
        dueDiligenceStatus: dto.approved ? 'APPROVED' : 'REJECTED',
        lastReviewedAt: now,
        nextReviewDate: dto.approved ? nextReviewDate : null,
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: dto.approved ? 'VENDOR_RELATIONSHIP_APPROVED' : 'VENDOR_RELATIONSHIP_REJECTED',
      entityType: 'Vendor',
      entityId: vendorId,
      metadata: {
        approved: dto.approved,
        notes: dto.notes,
        conditionalTerms: dto.conditionalTerms,
      },
    });

    return this.mapToDto(updated);
  }

  /**
   * Executes structured vendor offboarding, ensuring access revocation and data return/destruction certification.
   */
  async offboardVendor(
    authCtx: ResourceAuthContext,
    vendorId: string,
    dto: VendorOffboardingDto,
  ): Promise<VendorDto> {
    const vendor = await this.findOne(authCtx, vendorId);

    if (!dto.accessRevoked) {
      throw new BadRequestException('All systems and API access must be revoked before offboarding vendor.');
    }
    if (!dto.dataReturnedOrDestroyed) {
      throw new BadRequestException('Formal certification of customer data return or destruction is required.');
    }
    if (!dto.contractTerminated) {
      throw new BadRequestException('Contractual termination must be executed before completing offboarding.');
    }

    const existingVendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    const { summary, tprm } = decodeVendorDescription(existingVendor?.description);
    const updatedTprm = {
      ...(tprm || {}),
      offboarding: {
        accessRevoked: dto.accessRevoked,
        dataReturnedOrDestroyed: dto.dataReturnedOrDestroyed,
        contractTerminated: dto.contractTerminated,
        auditEvidenceArchived: dto.auditEvidenceArchived,
        notes: dto.notes || 'Vendor offboarding checklist fully executed.',
        offboardedBy: authCtx.userId,
        offboardedAt: new Date().toISOString(),
      },
    };

    const updatedDesc = encodeVendorDescription(summary, updatedTprm);

    const updated = await this.prisma.vendor.update({
      where: { id: vendorId },
      data: {
        status: VendorStatus.INACTIVE,
        dueDiligenceStatus: 'DECOMMISSIONED',
        description: updatedDesc,
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VENDOR_OFFBOARDED',
      entityType: 'Vendor',
      entityId: vendorId,
      metadata: {
        accessRevoked: dto.accessRevoked,
        dataReturnedOrDestroyed: dto.dataReturnedOrDestroyed,
        contractTerminated: dto.contractTerminated,
      },
    });

    return this.mapToDto(updated);
  }

  /**
   * Transitions vendor through the TPRM lifecycle stages.
   */
  async transitionLifecycle(
    authCtx: ResourceAuthContext,
    vendorId: string,
    dto: LifecycleTransitionDto,
  ): Promise<VendorDto> {
    await this.findOne(authCtx, vendorId);

    const updated = await this.prisma.vendor.update({
      where: { id: vendorId },
      data: { dueDiligenceStatus: dto.targetStage },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VENDOR_LIFECYCLE_TRANSITION',
      entityType: 'Vendor',
      entityId: vendorId,
      metadata: { targetStage: dto.targetStage, rationale: dto.rationale },
    });

    return this.mapToDto(updated);
  }

  /**
   * Triggers scheduled periodic reassessment for a vendor.
   */
  async triggerReassessment(
    authCtx: ResourceAuthContext,
    vendorId: string,
  ): Promise<VendorDto> {
    const vendor = await this.findOne(authCtx, vendorId);

    const assessment = await this.createAssessment(authCtx, vendorId, {
      title: `Periodic Reassessment (${vendor.criticality} Cadence: ${vendor.reviewCadenceDays}d)`,
      status: VendorAssessmentStatus.SCHEDULED,
      evaluatorId: authCtx.userId,
    });

    const updated = await this.prisma.vendor.update({
      where: { id: vendorId },
      data: { dueDiligenceStatus: 'REASSESSMENT' },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VENDOR_REASSESSMENT_TRIGGERED',
      entityType: 'Vendor',
      entityId: vendorId,
      metadata: { assessmentId: assessment.id, cadenceDays: vendor.reviewCadenceDays },
    });

    return this.mapToDto(updated);
  }
}
