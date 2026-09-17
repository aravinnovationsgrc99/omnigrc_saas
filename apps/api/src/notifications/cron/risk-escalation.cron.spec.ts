import { Test, TestingModule } from '@nestjs/testing';
import { RiskEscalationCron } from './risk-escalation.cron';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications.service';
import { ResendMailerService } from '../mailer/resend-mailer.service';
import { LicenseVerificationService } from '../../license-verification/license-verification.service';
import { NotificationType, Role, RiskStatus } from '@omnigrc/shared';

describe('RiskEscalationCron (Batched Idempotency)', () => {
  let cron: RiskEscalationCron;
  let prisma: jest.Mocked<any>;
  let notificationsService: jest.Mocked<any>;
  let resendMailerService: jest.Mocked<any>;
  let licenseVerificationService: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      risk: {
        findMany: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
      },
      notification: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    notificationsService = {
      notify: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    };

    resendMailerService = {
      sendBatchEmail: jest.fn().mockResolvedValue({
        successfulTos: ['admin@orga.com', 'admin@orgb.com'],
        failedTos: [],
      }),
    };

    licenseVerificationService = {
      getEvaluatedState: jest.fn().mockResolvedValue({ state: 'VALID' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RiskEscalationCron,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: ResendMailerService, useValue: resendMailerService },
        { provide: LicenseVerificationService, useValue: licenseVerificationService },
      ],
    }).compile();

    cron = module.get<RiskEscalationCron>(RiskEscalationCron);
  });

  it('should skip execution if license is invalid', async () => {
    licenseVerificationService.getEvaluatedState.mockResolvedValueOnce({ state: 'EXPIRED' });
    await cron.handleRiskEscalations();

    expect(prisma.risk.findMany).not.toHaveBeenCalled();
    expect(resendMailerService.sendBatchEmail).not.toHaveBeenCalled();
  });

  it('should perform a single BATCHED findMany query for idempotency and send emails for unescalated risks', async () => {
    const highRisks = [
      { id: 'risk-1', title: 'Critical Vuln 1', score: 20, organizationId: 'org-A', owner: 'admin@orga.com', status: RiskStatus.OPEN },
      { id: 'risk-2', title: 'Critical Vuln 2', score: 18, organizationId: 'org-B', owner: 'admin@orgb.com', status: RiskStatus.OPEN },
    ];

    prisma.risk.findMany.mockResolvedValueOnce(highRisks);

    // Mock batched idempotency check returning that risk-1 was already escalated today
    prisma.notification.findMany.mockResolvedValueOnce([
      { entityId: 'risk-1' },
    ]);

    prisma.user.findMany.mockResolvedValue([
      { id: 'user-B', email: 'admin@orgb.com', name: 'Admin OrgB' },
    ]);

    await cron.handleRiskEscalations();

    // Verify N+1 is eliminated: findFirst must NOT be called
    expect(prisma.notification.findFirst).not.toHaveBeenCalled();

    // Verify single batched lookup was executed with in filter
    expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityType: 'RISK',
          entityId: { in: ['risk-1', 'risk-2'] },
          type: NotificationType.RISK_ESCALATION,
        }),
      }),
    );

    // Verify risk-1 is skipped and risk-2 triggers batch email sending
    expect(resendMailerService.sendBatchEmail).toHaveBeenCalledTimes(1);
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            organizationId: 'org-B',
            entityId: 'risk-2',
          }),
        ]),
      }),
    );
  });

  it('should maintain duplicate cron execution idempotency (suppress all if already dispatched)', async () => {
    const highRisks = [
      { id: 'risk-1', title: 'Critical Vuln 1', score: 20, organizationId: 'org-A', owner: 'admin@orga.com', status: RiskStatus.OPEN },
    ];

    prisma.risk.findMany.mockResolvedValue(highRisks);
    prisma.notification.findMany.mockResolvedValue([{ entityId: 'risk-1' }]);

    await cron.handleRiskEscalations();

    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(resendMailerService.sendBatchEmail).not.toHaveBeenCalled();
  });
});
