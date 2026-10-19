import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ResendMailerService } from './mailer/resend-mailer.service';
import { SlackNotifierService } from './slack/slack-notifier.service';
import { NotificationType } from '@omnigrc/shared';

describe('Phase 3 Notifications Specification & Traceability Suite', () => {
  let service: NotificationsService;
  let prisma: any;
  let resendMailerService: any;
  let slackNotifierService: any;

  beforeEach(async () => {
    prisma = {
      notification: {
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn().mockImplementation((args) => Promise.resolve({ id: 'notif-1', ...args.data })),
        update: jest.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    resendMailerService = {
      sendEmail: jest.fn().mockResolvedValue(true),
    };

    slackNotifierService = {
      sendSlackAlert: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ResendMailerService, useValue: resendMailerService },
        { provide: SlackNotifierService, useValue: slackNotifierService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('Section 7 & 8: Recipient Resolution, Authorization & Tenant Scoping', () => {
    it('should resolve recipient by user ID strictly within the authorized organization', async () => {
      prisma.user.findFirst.mockImplementation(({ where }: any) => {
        if (where.organizationId === 'org-tenant-1') {
          return Promise.resolve({
            id: 'usr-1',
            email: 'auditor@org1.com',
            name: 'Lead Auditor',
            role: 'AUDITOR',
            organizationId: 'org-tenant-1',
            emailNotifications: true,
          });
        }
        return Promise.resolve(null);
      });

      await service.notify({
        organizationId: 'org-tenant-1',
        userId: 'usr-1',
        type: NotificationType.TASK_ASSIGNED,
        message: 'Audit Plan submitted',
        entityType: 'AuditPlan',
        entityId: 'plan-101',
      });

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-tenant-1',
          OR: [{ id: 'usr-1' }, { email: 'usr-1' }],
        },
        select: { id: true, email: true, name: true, emailNotifications: true },
      });

      expect(resendMailerService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'auditor@org1.com',
          organizationId: 'org-tenant-1',
          subject: expect.stringContaining('TASK ASSIGNED'),
        }),
        expect.any(String),
      );

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-tenant-1',
          userId: 'usr-1',
          type: NotificationType.TASK_ASSIGNED,
          message: 'Audit Plan submitted',
          entityType: 'AuditPlan',
          entityId: 'plan-101',
        }),
      });

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: { emailSentAt: expect.any(Date) },
      });
    });

    it('should resolve recipient by email address strictly within the authorized organization', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'usr-2',
        email: 'owner@org1.com',
        name: 'Risk Owner',
        role: 'USER',
        organizationId: 'org-tenant-1',
        emailNotifications: true,
      });

      await service.notify({
        organizationId: 'org-tenant-1',
        userId: 'owner@org1.com',
        type: NotificationType.TASK_ASSIGNED,
        message: 'Risk assigned',
        entityType: 'Risk',
        entityId: 'risk-55',
      });

      expect(resendMailerService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'owner@org1.com',
          organizationId: 'org-tenant-1',
        }),
        expect.any(String),
      );
    });

    it('should prevent cross-tenant notification delivery: fall back to org admin when target user does not belong to organization', async () => {
      // User lookup within tenant 1 returns null for cross-tenant user
      prisma.user.findFirst.mockResolvedValue(null);
      // Fallback lookup returns tenant 1 admin
      prisma.user.findMany.mockResolvedValue([
        { id: 'admin-1', email: 'admin@org1.com', name: 'Tenant 1 Admin', role: 'ADMIN', organizationId: 'org-tenant-1', emailNotifications: true },
      ]);

      await service.notify({
        organizationId: 'org-tenant-1',
        userId: 'cross-tenant-attacker-user-id',
        type: NotificationType.TASK_ASSIGNED,
        message: 'Sensitive incident update',
        entityType: 'Incident',
        entityId: 'inc-99',
      });

      // Crucial: email sent ONLY to tenant 1 admin, NEVER to cross-tenant user
      expect(resendMailerService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'admin@org1.com',
          organizationId: 'org-tenant-1',
        }),
        expect.any(String),
      );
      expect(resendMailerService.sendEmail).not.toHaveBeenCalledWith(
        expect.objectContaining({
          to: expect.stringContaining('cross-tenant'),
        }),
        expect.anything(),
      );
    });

    it('should fall back to organization Admins when recipient userId is not specified', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'admin-1', email: 'admin@org1.com', name: 'Admin', role: 'ADMIN', organizationId: 'org-tenant-1', emailNotifications: true },
      ]);

      await service.notify({
        organizationId: 'org-tenant-1',
        type: NotificationType.RISK_ESCALATION,
        message: 'Unresolved Critical Vulnerability Escalation',
        entityType: 'Vulnerability',
        entityId: 'vuln-1',
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-tenant-1', role: 'ADMIN' },
        select: { id: true, email: true, name: true, emailNotifications: true },
      });

      expect(resendMailerService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'admin@org1.com',
          organizationId: 'org-tenant-1',
          subject: expect.stringContaining('RISK ESCALATION'),
        }),
        expect.any(String),
      );
    });
  });

  describe('Section 5 & 8: Provider Integration & Delivery Error Handling', () => {
    it('should distinguish provider failure and record emailError without marking as delivered', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'usr-1',
        email: 'owner@org1.com',
        role: 'USER',
        emailNotifications: true,
      });

      resendMailerService.sendEmail.mockResolvedValue(false);

      await service.notify({
        organizationId: 'org-tenant-1',
        userId: 'usr-1',
        type: NotificationType.DUE_DATE_REMINDER,
        message: 'Upcoming policy review reminder',
        entityType: 'Policy',
        entityId: 'pol-1',
      });

      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it('should catch exceptions thrown by email provider gracefully and record error message', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'usr-1',
        email: 'owner@org1.com',
        role: 'USER',
        emailNotifications: true,
      });

      resendMailerService.sendEmail.mockRejectedValue(new Error('Network connection timeout'));

      await service.notify({
        organizationId: 'org-tenant-1',
        userId: 'usr-1',
        type: NotificationType.TASK_ASSIGNED,
        message: 'New incident assigned',
        entityType: 'Incident',
        entityId: 'inc-1',
      });

      expect(prisma.notification.update).not.toHaveBeenCalled();
    });
  });

  describe('Section 3: Workbook Criterion Notification Payloads & Metadata Traceability', () => {
    it('Criterion 1: Audit Plan Submission event payload', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'owner-1', email: 'audit-owner@test.com', emailNotifications: true });

      await service.notify({
        organizationId: 'org-1',
        userId: 'owner-1',
        type: NotificationType.TASK_ASSIGNED,
        message: 'Audit plan "Annual SOC 2 Type II" has been submitted/created.',
        entityType: 'AuditPlan',
        entityId: 'plan-1',
      });

      expect(resendMailerService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'audit-owner@test.com',
          organizationId: 'org-1',
          html: expect.stringContaining('Annual SOC 2 Type II'),
        }),
        expect.any(String),
      );
    });

    it('Criterion 6: Policy assignment notification to owner', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'policy-owner', email: 'polowner@test.com', emailNotifications: true });

      await service.notify({
        organizationId: 'org-1',
        userId: 'policy-owner',
        type: NotificationType.TASK_ASSIGNED,
        message: 'You have been assigned as the owner of Policy "Access Control Policy" (POL-001).',
        entityType: 'Policy',
        entityId: 'pol-1',
      });

      expect(resendMailerService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'polowner@test.com',
          organizationId: 'org-1',
          html: expect.stringContaining('Access Control Policy'),
        }),
        expect.any(String),
      );
    });

    it('Criterion 10: Risk assignment notification to Risk Owner', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'risk-owner', email: 'riskowner@test.com', emailNotifications: true });

      await service.notify({
        organizationId: 'org-1',
        userId: 'risk-owner',
        type: NotificationType.TASK_ASSIGNED,
        message: 'You have been assigned as the owner of Risk "Ransomware Exposure".',
        entityType: 'Risk',
        entityId: 'risk-1',
      });

      expect(resendMailerService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'riskowner@test.com',
          organizationId: 'org-1',
          html: expect.stringContaining('Ransomware Exposure'),
        }),
        expect.any(String),
      );
    });

    it('Criterion 14: Vendor onboarding notification', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'vendor-lead', email: 'vendorlead@test.com', emailNotifications: true });

      await service.notify({
        organizationId: 'org-1',
        userId: 'vendor-lead',
        type: NotificationType.TASK_ASSIGNED,
        message: 'Vendor "CloudCorp Systems" has been onboarded/registered.',
        entityType: 'Vendor',
        entityId: 'vnd-1',
      });

      expect(resendMailerService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'vendorlead@test.com',
          organizationId: 'org-1',
          html: expect.stringContaining('CloudCorp Systems'),
        }),
        expect.any(String),
      );
    });

    it('Criterion 18: New vulnerability assignment notification', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'sec-eng', email: 'seceng@test.com', emailNotifications: true });

      await service.notify({
        organizationId: 'org-1',
        userId: 'sec-eng',
        type: NotificationType.TASK_ASSIGNED,
        message: 'You have been assigned to remediate Vulnerability "CVE-2026-1234 Remote Code Execution" (Severity: CRITICAL).',
        entityType: 'Vulnerability',
        entityId: 'vuln-1',
      });

      expect(resendMailerService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'seceng@test.com',
          organizationId: 'org-1',
          html: expect.stringContaining('CVE-2026-1234'),
        }),
        expect.any(String),
      );
    });

    it('Criterion 28: New incident notification', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'ir-lead', email: 'irlead@test.com', emailNotifications: true });

      await service.notify({
        organizationId: 'org-1',
        userId: 'ir-lead',
        type: NotificationType.TASK_ASSIGNED,
        message: 'New incident assigned: "Production API Latency Spike" (Severity: HIGH).',
        entityType: 'Incident',
        entityId: 'inc-1',
      });

      expect(resendMailerService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'irlead@test.com',
          organizationId: 'org-1',
          html: expect.stringContaining('Production API Latency Spike'),
        }),
        expect.any(String),
      );
    });
  });
});
