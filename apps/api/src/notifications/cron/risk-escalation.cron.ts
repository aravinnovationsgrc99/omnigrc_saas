import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications.service';
import { renderRiskEscalationHtml, PriorityLevel } from '../templates/email-templates';
import { ResendMailerService } from '../mailer/resend-mailer.service';
import { NotificationType, Role, RiskStatus } from '@omnigrc/shared';
import { LicenseVerificationService } from '../../license-verification/license-verification.service';
import { EffectiveServiceStateResolver } from '../../service-control/effective-service-state-resolver.service';
import { TenantContext } from '../../tenant/tenant.context';

@Injectable()
export class RiskEscalationCron {
  private readonly logger = new Logger(RiskEscalationCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly resendMailerService: ResendMailerService,
    private readonly licenseVerificationService: LicenseVerificationService,
    private readonly effectiveServiceStateResolver: EffectiveServiceStateResolver,
  ) {}

  @Cron('0 1 * * *', { timeZone: 'UTC' })
  async handleRiskEscalations() {
    return TenantContext.runSystemContext(async () => {
      const licenseState = await this.licenseVerificationService.getEvaluatedState();
      if (licenseState.state !== 'VALID') {
        this.logger.debug(`Skipping daily High-Risk SLA Escalation cron job: license state is ${licenseState.state}.`);
        return;
      }

    this.logger.log('Running daily High-Risk SLA Escalation cron job (UTC canonical timezone)...');

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const highRisksRaw = await this.prisma.risk.findMany({
      where: {
        score: { gte: 15 },
        status: { in: [RiskStatus.OPEN, RiskStatus.IN_TREATMENT] },
        deletedAt: null,
      },
      include: {
        organization: {
          select: {
            controlStateProjection: { select: { state: true } },
          },
        },
      },
    });

    const eligibleRisks: typeof highRisksRaw = [];
    for (const risk of highRisksRaw) {
      const state = risk.organization?.controlStateProjection?.state;
      if (state && ['SUSPENDED', 'DISABLED', 'DECOMMISSIONED'].includes(state)) {
        continue;
      }

      // Check CP-3 Capability Controls
      const riskCap = await this.effectiveServiceStateResolver.resolveEffectiveState(risk.organizationId, 'GRC_CORE_RISKS');
      if (!riskCap.isAvailable) {
        continue;
      }

      const emailCap = await this.effectiveServiceStateResolver.resolveEffectiveState(risk.organizationId, 'NOTIFICATIONS_EMAIL');
      if (!emailCap.isAvailable) {
        continue;
      }

      eligibleRisks.push(risk);
    }

    this.logger.log(`Found ${eligibleRisks.length} unmitigated high-severity risks (score >= 15) for active organizations.`);

    if (eligibleRisks.length === 0) {
      this.logger.log('Completed daily High-Risk SLA Escalation cron execution.');
      return;
    }

    const riskIds = eligibleRisks.map((risk) => risk.id);

    const existingEscalationsToday = await this.prisma.notification.findMany({
      where: {
        entityType: 'RISK',
        entityId: { in: riskIds },
        type: NotificationType.RISK_ESCALATION,
        createdAt: { gte: startOfToday },
        emailSentAt: { not: null },
      },
      select: {
        entityId: true,
      },
    });

    const sentRiskIds = new Set(
      existingEscalationsToday
        .map((n) => n.entityId)
        .filter((id): id is string => Boolean(id)),
    );

    for (const risk of eligibleRisks) {
      if (sentRiskIds.has(risk.id)) {
        this.logger.debug(`Idempotency Guard: Risk escalation already dispatched today for risk ${risk.id}. Skipping.`);
        continue;
      }

      const targetUsers = await this.prisma.user.findMany({
        where: {
          organizationId: risk.organizationId,
          OR: [
            { role: Role.ADMIN },
            { email: risk.owner },
          ],
          emailNotifications: true,
        },
        select: { id: true, email: true, name: true },
      });

      if (targetUsers.length === 0) {
        continue;
      }

      for (const user of targetUsers) {
        const html = renderRiskEscalationHtml({
          userName: user.name || user.email,
          riskTitle: risk.title,
          score: risk.score,
          owner: risk.owner,
          treatmentPlan: risk.status,
        });

        await this.resendMailerService.sendEmail(
          {
            to: user.email,
            subject: `[CRITICAL SLA ESCALATION] High-Severity Risk Unmitigated: ${risk.title}`,
            html,
            organizationId: risk.organizationId,
          },
          PriorityLevel.P0,
        );

        await this.prisma.notification.create({
          data: {
            organizationId: risk.organizationId,
            userId: user.id,
            message: `Unmitigated High Risk "${risk.title}" (Score: ${risk.score}) requires immediate treatment.`,
            type: NotificationType.RISK_ESCALATION,
            entityType: 'RISK',
            entityId: risk.id,
            emailSentAt: new Date(),
          },
        });
      }
    }

    this.logger.log('Completed daily High-Risk SLA Escalation cron execution.');

    // 2. Overdue Audit Activities Escalation (Criterion 5)
    await this.handleOverdueAuditEscalations(now, startOfToday);

    // 3. Pending Approvals Escalation (Criterion 9)
    await this.handlePendingApprovalEscalations(now, startOfToday);

    // 4. Overdue Vendor Assessments Escalation (Criterion 17)
    await this.handleOverdueVendorAssessmentEscalations(now, startOfToday);

    // 5. Vulnerability SLA Breach & Unresolved Escalations (Criterion 20 & 22)
    await this.handleVulnerabilitySlaEscalations(now, startOfToday);

    // 6. Incident SLA Breach Escalation (Criterion 29)
    await this.handleIncidentSlaBreachEscalations(now, startOfToday);
    });
  }

  private async handleOverdueAuditEscalations(now: Date, startOfToday: Date): Promise<void> {
    try {
      if (this.prisma.auditSchedule) {
        const overdueSchedules = await this.prisma.auditSchedule.findMany({
          where: {
            status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
            scheduledEndDate: { lt: now },
          },
          take: 100,
        });

        const schedIds = overdueSchedules.map((s: any) => s.id);
        const existing = await this.prisma.notification.findMany({
          where: {
            entityType: 'AuditSchedule',
            entityId: { in: schedIds },
            type: NotificationType.RISK_ESCALATION,
            createdAt: { gte: startOfToday },
            emailSentAt: { not: null },
          },
          select: { entityId: true },
        });
        const sentIds = new Set(existing.map((n: any) => n.entityId));

        for (const sched of overdueSchedules) {
          if (sentIds.has(sched.id)) continue;
          await this.notificationsService.notify({
            organizationId: sched.organizationId,
            userId: sched.leadAuditorId || undefined,
            message: `OVERDUE ESCALATION: Audit schedule "${sched.id}" is overdue (planned end date was ${sched.scheduledEndDate ? new Date(sched.scheduledEndDate).toLocaleDateString() : 'past'}).`,
            type: NotificationType.RISK_ESCALATION,
            entityType: 'AuditSchedule',
            entityId: sched.id,
          });
        }
      }

      if (this.prisma.auditCapa) {
        const overdueCapas = await this.prisma.auditCapa.findMany({
          where: {
            status: 'OPEN',
            dueDate: { lt: now },
          },
          take: 100,
        });

        const capaIds = overdueCapas.map((c: any) => c.id);
        const existingCapas = await this.prisma.notification.findMany({
          where: {
            entityType: 'AuditCapa',
            entityId: { in: capaIds },
            type: NotificationType.RISK_ESCALATION,
            createdAt: { gte: startOfToday },
            emailSentAt: { not: null },
          },
          select: { entityId: true },
        });
        const sentCapaIds = new Set(existingCapas.map((n: any) => n.entityId));

        for (const capa of overdueCapas) {
          if (sentCapaIds.has(capa.id)) continue;
          await this.notificationsService.notify({
            organizationId: capa.organizationId,
            userId: capa.ownerId || undefined,
            message: `OVERDUE ESCALATION: Audit CAPA action "${capa.title}" is overdue (was due on ${capa.dueDate ? new Date(capa.dueDate).toLocaleDateString() : 'past'}).`,
            type: NotificationType.RISK_ESCALATION,
            entityType: 'AuditCapa',
            entityId: capa.id,
          });
        }
      }
    } catch (err: any) {
      this.logger.error(`Error in audit escalation handler: ${err.message}`);
    }
  }

  private async handlePendingApprovalEscalations(now: Date, startOfToday: Date): Promise<void> {
    if (!this.prisma.approvalInstance) return;
    try {
      const pendingApprovals = await this.prisma.approvalInstance.findMany({
        where: {
          status: { in: ['PENDING', 'IN_REVIEW'] },
          dueAt: { lt: now },
        },
        include: {
          steps: { orderBy: { stepNumber: 'asc' } },
        },
        take: 100,
      });

      if (pendingApprovals.length === 0) return;

      const appIds = pendingApprovals.map((a: any) => a.id);
      const existing = await this.prisma.notification.findMany({
        where: {
          entityType: 'ApprovalInstance',
          entityId: { in: appIds },
          type: NotificationType.RISK_ESCALATION,
          createdAt: { gte: startOfToday },
          emailSentAt: { not: null },
        },
        select: { entityId: true },
      });
      const sentIds = new Set(existing.map((n: any) => n.entityId));

      for (const instance of pendingApprovals) {
        if (sentIds.has(instance.id)) continue;
        const activeStep = instance.steps.find((s: any) => s.stepNumber === instance.currentStepNumber);
        const targetUserId = activeStep?.specificUserId || undefined;

        await this.notificationsService.notify({
          organizationId: instance.organizationId,
          userId: targetUserId,
          message: `APPROVAL ESCALATION: Approval request "${instance.title}" is overdue for review at Step ${instance.currentStepNumber} (${activeStep?.name || 'Review'}).`,
          type: NotificationType.RISK_ESCALATION,
          entityType: 'ApprovalInstance',
          entityId: instance.id,
        });
      }
    } catch (err: any) {
      this.logger.error(`Error in approval escalation handler: ${err.message}`);
    }
  }

  private async handleOverdueVendorAssessmentEscalations(now: Date, startOfToday: Date): Promise<void> {
    if (!this.prisma.vendorAssessmentAction) return;
    try {
      const overdueActions = await this.prisma.vendorAssessmentAction.findMany({
        where: {
          status: 'OPEN',
          dueDate: { lt: now },
        },
        take: 100,
      });

      if (overdueActions.length === 0) return;

      const actionIds = overdueActions.map((a: any) => a.id);
      const existing = await this.prisma.notification.findMany({
        where: {
          entityType: 'VendorAssessmentAction',
          entityId: { in: actionIds },
          type: NotificationType.RISK_ESCALATION,
          createdAt: { gte: startOfToday },
          emailSentAt: { not: null },
        },
        select: { entityId: true },
      });
      const sentIds = new Set(existing.map((n: any) => n.entityId));

      for (const action of overdueActions) {
        if (sentIds.has(action.id)) continue;
        const dueStr = action.dueDate ? new Date(action.dueDate).toLocaleDateString() : 'past';

        await this.notificationsService.notify({
          organizationId: action.organizationId,
          userId: action.owner || undefined,
          message: `OVERDUE ESCALATION: Vendor assessment remediation "${action.title}" is overdue (was due on ${dueStr}).`,
          type: NotificationType.RISK_ESCALATION,
          entityType: 'VendorAssessmentAction',
          entityId: action.id,
        });
      }
    } catch (err: any) {
      this.logger.error(`Error in vendor assessment escalation handler: ${err.message}`);
    }
  }

  private async handleVulnerabilitySlaEscalations(now: Date, startOfToday: Date): Promise<void> {
    if (!this.prisma.vulnerability) return;
    try {
      // Criterion 20: SLA breach/overdue vulnerability
      const breachedVulns = await this.prisma.vulnerability.findMany({
        where: {
          status: { in: ['OPEN', 'IN_REMEDIATION'] },
          dueDate: { lt: now },
          deletedAt: null,
        },
        take: 100,
      });

      const vulnIds = breachedVulns.map((v: any) => v.id);
      const existing = await this.prisma.notification.findMany({
        where: {
          entityType: 'Vulnerability',
          entityId: { in: vulnIds },
          type: NotificationType.RISK_ESCALATION,
          createdAt: { gte: startOfToday },
          emailSentAt: { not: null },
        },
        select: { entityId: true },
      });
      const sentIds = new Set(existing.map((n: any) => n.entityId));

      for (const vuln of breachedVulns) {
        if (sentIds.has(vuln.id)) continue;
        const dueStr = vuln.dueDate ? new Date(vuln.dueDate).toLocaleDateString() : 'past';

        await this.notificationsService.notify({
          organizationId: vuln.organizationId,
          userId: vuln.remediationOwner || undefined,
          message: `SLA BREACH: Vulnerability "${vuln.title}" (${vuln.severity}) has breached remediation SLA (was due on ${dueStr}).`,
          type: NotificationType.RISK_ESCALATION,
          entityType: 'Vulnerability',
          entityId: vuln.id,
        });
      }

      // Criterion 22: Escalation notification for unresolved vulnerabilities (>14 days)
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(now.getDate() - 14);

      const unresolvedHigh = await this.prisma.vulnerability.findMany({
        where: {
          status: { in: ['OPEN', 'IN_REMEDIATION'] },
          severity: { in: ['CRITICAL', 'HIGH'] },
          createdAt: { lt: fourteenDaysAgo },
          deletedAt: null,
        },
        take: 100,
      });

      for (const vuln of unresolvedHigh) {
        if (sentIds.has(vuln.id)) continue;
        await this.notificationsService.notify({
          organizationId: vuln.organizationId,
          userId: vuln.remediationOwner || undefined,
          message: `CRITICAL ESCALATION: High/Critical vulnerability "${vuln.title}" remains unmitigated after 14+ days.`,
          type: NotificationType.RISK_ESCALATION,
          entityType: 'Vulnerability',
          entityId: vuln.id,
        });
      }
    } catch (err: any) {
      this.logger.error(`Error in vulnerability SLA escalation handler: ${err.message}`);
    }
  }

  private async handleIncidentSlaBreachEscalations(now: Date, startOfToday: Date): Promise<void> {
    if (!this.prisma.incident) return;
    try {
      // Criterion 29: SLA breach/escalation notification
      const breachedIncidents = await this.prisma.incident.findMany({
        where: {
          status: { in: ['OPEN', 'IN_PROGRESS', 'CONTAINED'] },
          dueDate: { lt: now },
          deletedAt: null,
        },
        take: 100,
      });

      if (breachedIncidents.length === 0) return;

      const incIds = breachedIncidents.map((i: any) => i.id);
      const existing = await this.prisma.notification.findMany({
        where: {
          entityType: 'Incident',
          entityId: { in: incIds },
          type: NotificationType.RISK_ESCALATION,
          createdAt: { gte: startOfToday },
          emailSentAt: { not: null },
        },
        select: { entityId: true },
      });
      const sentIds = new Set(existing.map((n: any) => n.entityId));

      for (const incident of breachedIncidents) {
        if (sentIds.has(incident.id)) continue;
        const dueStr = incident.dueDate ? new Date(incident.dueDate).toLocaleDateString() : 'past';

        await this.notificationsService.notify({
          organizationId: incident.organizationId,
          userId: incident.owner || undefined,
          message: `SLA BREACH ESCALATION: Incident "${incident.title}" (Severity: ${incident.severity}) has breached its resolution SLA (deadline was ${dueStr}).`,
          type: NotificationType.RISK_ESCALATION,
          entityType: 'Incident',
          entityId: incident.id,
        });
      }
    } catch (err: any) {
      this.logger.error(`Error in incident SLA escalation handler: ${err.message}`);
    }
  }
}
