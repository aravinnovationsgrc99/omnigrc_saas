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
} from '@omnigrc/shared';
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

    const vendor = await this.prisma.vendor.create({
      data: {
        organizationId: authCtx.organizationId,
        departmentId: dto.departmentId || null,
        projectId: dto.projectId || null,
        name: dto.name,
        description: dto.description || null,
        category: dto.category || null,
        criticality: dto.criticality || VendorCriticality.MEDIUM,
        status: dto.status || VendorStatus.ACTIVE,
        owner: dto.owner,
        department: dto.department || null,
        reviewCadenceDays: dto.reviewCadenceDays || 365,
        nextReviewDate,
        websiteUrl: dto.websiteUrl || null,
        dueDiligenceStatus: dto.dueDiligenceStatus || 'PENDING',
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
    return {
      id: vendor.id,
      organizationId: vendor.organizationId,
      departmentId: vendor.departmentId || null,
      projectId: vendor.projectId || null,
      name: vendor.name,
      description: vendor.description,
      category: vendor.category,
      criticality: vendor.criticality as VendorCriticality,
      status: vendor.status as VendorStatus,
      owner: vendor.owner,
      department: vendor.department,
      reviewCadenceDays: vendor.reviewCadenceDays,
      lastReviewedAt: vendor.lastReviewedAt ? vendor.lastReviewedAt.toISOString() : null,
      nextReviewDate: vendor.nextReviewDate ? vendor.nextReviewDate.toISOString() : null,
      websiteUrl: vendor.websiteUrl,
      dueDiligenceStatus: vendor.dueDiligenceStatus || 'PENDING',
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
        completedAt: a.completedAt ? a.completedAt.toISOString() : null,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
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

    let items: VendorDocumentDto[] = joins.map((j) => ({
      id: j.id,
      vendorId: j.vendorId,
      evidenceId: j.evidenceId,
      attachedAt: j.attachedAt.toISOString(),
      title: j.evidence.title,
      description: j.evidence.description,
      fileName: j.evidence.fileName,
      fileSize: j.evidence.fileSize,
      mimeType: j.evidence.mimeType,
      status: j.evidence.status as EvidenceStatus,
      scanStatus: j.evidence.scanStatus as EvidenceScanStatus,
      uploadedById: j.evidence.uploadedById,
      uploaderName: userMap.get(j.evidence.uploadedById) || 'Security Team',
    }));

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
    const items = await this.prisma.vendorQuestionnaire.findMany({
      where: { organizationId: authCtx.organizationId },
      orderBy: { createdAt: 'desc' },
    });

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
}
