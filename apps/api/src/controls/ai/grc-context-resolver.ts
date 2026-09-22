import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export enum LiveDataIntent {
  MY_OPEN_RISKS = 'MY_OPEN_RISKS',
  MY_PENDING_APPROVALS = 'MY_PENDING_APPROVALS',
  MY_COMPLIANCE_TASKS = 'MY_COMPLIANCE_TASKS',
  ORGANIZATION_CONTROLS_SUMMARY = 'ORGANIZATION_CONTROLS_SUMMARY',
  ORGANIZATION_FRAMEWORK_ENTITLEMENTS = 'ORGANIZATION_FRAMEWORK_ENTITLEMENTS',
  ORGANIZATION_EVIDENCE_SUMMARY = 'ORGANIZATION_EVIDENCE_SUMMARY',
  NONE = 'NONE',
}

export interface ResolvedContext {
  intent: LiveDataIntent;
  summaryText?: string;
  sourceTag?: string;
}

@Injectable()
export class GrcContextResolver {
  private readonly logger = new Logger(GrcContextResolver.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finite, explicit intent detection based on strict keyword matching.
   * If no explicit intent is recognized, returns NONE and performs zero database queries.
   */
  public detectIntent(query: string): LiveDataIntent {
    if (!query || !query.trim()) return LiveDataIntent.NONE;

    const lower = query.toLowerCase();

    if (lower.includes('risk') && (lower.includes('open') || lower.includes('my') || lower.includes('assigned') || lower.includes('overdue'))) {
      return LiveDataIntent.MY_OPEN_RISKS;
    }
    if (lower.includes('approval') && (lower.includes('pending') || lower.includes('signoff') || lower.includes('my') || lower.includes('need'))) {
      return LiveDataIntent.MY_PENDING_APPROVALS;
    }
    if (lower.includes('task') && (lower.includes('compliance') || lower.includes('my') || lower.includes('assigned') || lower.includes('due'))) {
      return LiveDataIntent.MY_COMPLIANCE_TASKS;
    }
    if (lower.includes('control') && (lower.includes('count') || lower.includes('summary') || lower.includes('mapped') || lower.includes('list'))) {
      return LiveDataIntent.ORGANIZATION_CONTROLS_SUMMARY;
    }
    if (lower.includes('framework') && (lower.includes('entitlement') || lower.includes('active') || lower.includes('licensed') || lower.includes('access'))) {
      return LiveDataIntent.ORGANIZATION_FRAMEWORK_ENTITLEMENTS;
    }
    if (lower.includes('evidence') && (lower.includes('vault') || lower.includes('clean') || lower.includes('quarantined') || lower.includes('uploaded'))) {
      return LiveDataIntent.ORGANIZATION_EVIDENCE_SUMMARY;
    }

    return LiveDataIntent.NONE;
  }

  /**
   * Resolves bounded summary data for the recognized intent strictly scoped to caller's authenticated organizationId.
   */
  async resolveContext(organizationId: string, userId: string, intent: LiveDataIntent): Promise<ResolvedContext> {
    if (!organizationId || intent === LiveDataIntent.NONE) {
      return { intent: LiveDataIntent.NONE };
    }

    try {
      switch (intent) {
        case LiveDataIntent.MY_OPEN_RISKS: {
          const openRisks = await this.prisma.risk.findMany({
            where: { organizationId, status: 'OPEN', deletedAt: null },
            take: 5,
            select: { id: true, title: true, score: true, status: true, owner: true },
          });
          if (openRisks.length === 0) {
            return {
              intent,
              summaryText: 'Organization has 0 open risks currently recorded.',
              sourceTag: 'Authorized Organization Data: Risks',
            };
          }
          const summary = openRisks.map((r) => `- [Risk ${r.id.slice(0, 8)}] "${r.title}" (Score: ${r.score}, Owner: ${r.owner})`).join('\n');
          return {
            intent,
            summaryText: `Found ${openRisks.length} open risk(s):\n${summary}`,
            sourceTag: 'Authorized Organization Data: Risks',
          };
        }

        case LiveDataIntent.MY_PENDING_APPROVALS: {
          const pending = await this.prisma.approvalInstance.findMany({
            where: { organizationId, status: 'PENDING' },
            take: 5,
            select: { id: true, title: true, purpose: true, resourceType: true, createdAt: true },
          });
          if (pending.length === 0) {
            return {
              intent,
              summaryText: 'Organization has 0 pending approval requests currently requiring action.',
              sourceTag: 'Authorized Organization Data: Approvals',
            };
          }
          const summary = pending.map((a) => `- [Approval ${a.id.slice(0, 8)}] "${a.title}" (Purpose: ${a.purpose}, Resource: ${a.resourceType})`).join('\n');
          return {
            intent,
            summaryText: `Found ${pending.length} pending approval request(s):\n${summary}`,
            sourceTag: 'Authorized Organization Data: Approvals',
          };
        }

        case LiveDataIntent.MY_COMPLIANCE_TASKS: {
          const tasks = await this.prisma.complianceTask.findMany({
            where: { organizationId, deletedAt: null },
            take: 5,
            select: { id: true, title: true, status: true, dueDate: true, owner: true },
          });
          if (tasks.length === 0) {
            return {
              intent,
              summaryText: 'Organization has 0 compliance tasks registered.',
              sourceTag: 'Authorized Organization Data: Compliance Tasks',
            };
          }
          const summary = tasks.map((t) => `- [Task ${t.id.slice(0, 8)}] "${t.title}" (Status: ${t.status}, Owner: ${t.owner})`).join('\n');
          return {
            intent,
            summaryText: `Found ${tasks.length} compliance task(s):\n${summary}`,
            sourceTag: 'Authorized Organization Data: Compliance Tasks',
          };
        }

        case LiveDataIntent.ORGANIZATION_CONTROLS_SUMMARY: {
          const count = await this.prisma.control.count({
            where: { organizationId, deletedAt: null },
          });
          return {
            intent,
            summaryText: `Organization has ${count} security control(s) registered in the Control Register.`,
            sourceTag: 'Authorized Organization Data: Controls',
          };
        }

        case LiveDataIntent.ORGANIZATION_FRAMEWORK_ENTITLEMENTS: {
          const entitlements = await this.prisma.organizationFrameworkEntitlement.findMany({
            where: { organizationId },
            include: { framework: true },
          });
          if (entitlements.length === 0) {
            return {
              intent,
              summaryText: 'Organization currently has no custom framework entitlements configured.',
              sourceTag: 'Authorized Organization Data: Framework Entitlements',
            };
          }
          const summary = entitlements.map((e) => `- ${e.framework.name} (${e.framework.code}): Status ${e.status}`).join('\n');
          return {
            intent,
            summaryText: `Active Framework Entitlements:\n${summary}`,
            sourceTag: 'Authorized Organization Data: Framework Entitlements',
          };
        }

        case LiveDataIntent.ORGANIZATION_EVIDENCE_SUMMARY: {
          const count = await this.prisma.evidence.count({
            where: { organizationId },
          });
          return {
            intent,
            summaryText: `Organization has ${count} evidence document(s) stored in the Evidence Vault.`,
            sourceTag: 'Authorized Organization Data: Evidence Vault',
          };
        }

        default:
          return { intent: LiveDataIntent.NONE };
      }
    } catch (err: any) {
      this.logger.error(`Error resolving live context for intent ${intent}: ${err.message}`);
      return { intent: LiveDataIntent.NONE };
    }
  }
}
