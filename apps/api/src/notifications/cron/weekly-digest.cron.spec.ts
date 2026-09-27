import { Test, TestingModule } from '@nestjs/testing';
import { WeeklyDigestCron } from './weekly-digest.cron';
import { PrismaService } from '../../prisma/prisma.service';
import { ResendMailerService } from '../mailer/resend-mailer.service';
import { LicenseVerificationService } from '../../license-verification/license-verification.service';
import { EffectiveServiceStateResolver } from '../../service-control/effective-service-state-resolver.service';
import { NotificationType, Role, TaskStatus, RiskStatus } from '@omnigrc/shared';

describe('WeeklyDigestCron (Forensic Hardening & Tenant Isolation)', () => {
  let cron: WeeklyDigestCron;
  let prisma: jest.Mocked<any>;
  let resendMailerService: jest.Mocked<any>;
  let licenseVerificationService: jest.Mocked<any>;
  let effectiveServiceStateResolver: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      organization: {
        findMany: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
      },
      notification: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
      },
      complianceTask: {
        count: jest.fn().mockResolvedValue(0),
      },
      risk: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    resendMailerService = {
      sendEmail: jest.fn().mockResolvedValue({ id: 'email-1' }),
    };

    licenseVerificationService = {
      getEvaluatedState: jest.fn().mockResolvedValue({ state: 'VALID' }),
    };

    effectiveServiceStateResolver = {
      resolveEffectiveState: jest.fn().mockResolvedValue({
        isAvailable: true,
        effectiveState: 'AVAILABLE',
        reason: 'ENABLED',
        source: 'CATALOG_DEFAULT',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeeklyDigestCron,
        { provide: PrismaService, useValue: prisma },
        { provide: ResendMailerService, useValue: resendMailerService },
        { provide: LicenseVerificationService, useValue: licenseVerificationService },
        { provide: EffectiveServiceStateResolver, useValue: effectiveServiceStateResolver },
      ],
    }).compile();

    cron = module.get<WeeklyDigestCron>(WeeklyDigestCron);
  });

  it('1. ACTIVE organization + NOTIFICATIONS_EMAIL enabled → email processing permitted', async () => {
    prisma.organization.findMany.mockResolvedValueOnce([
      { id: 'org-active', name: 'Active Org', controlStateProjection: { state: 'ACTIVE' } },
    ]);
    prisma.notification.findFirst.mockResolvedValueOnce(null);
    prisma.user.findMany.mockResolvedValueOnce([
      { id: 'user-1', email: 'admin@active.com', name: 'Admin Active' },
    ]);

    await cron.handleWeeklyDigest();

    expect(resendMailerService.sendEmail).toHaveBeenCalledTimes(1);
    expect(resendMailerService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'admin@active.com',
        organizationId: 'org-active',
      }),
      expect.anything(),
    );
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it('2. ACTIVE organization + NOTIFICATIONS_EMAIL disabled → outbound email skipped', async () => {
    prisma.organization.findMany.mockResolvedValueOnce([
      { id: 'org-no-email', name: 'No Email Org', controlStateProjection: { state: 'ACTIVE' } },
    ]);

    effectiveServiceStateResolver.resolveEffectiveState.mockResolvedValueOnce({
      isAvailable: false,
      effectiveState: 'DISABLED',
      reason: 'NOTIFICATIONS_EMAIL capability disabled',
      source: 'ORGANIZATION_SERVICE_OVERRIDE',
    });

    await cron.handleWeeklyDigest();

    expect(resendMailerService.sendEmail).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('3. SUSPENDED organization → processing skipped', async () => {
    prisma.organization.findMany.mockResolvedValueOnce([
      { id: 'org-suspended', name: 'Suspended Org', controlStateProjection: { state: 'SUSPENDED' } },
    ]);

    await cron.handleWeeklyDigest();

    expect(effectiveServiceStateResolver.resolveEffectiveState).not.toHaveBeenCalled();
    expect(resendMailerService.sendEmail).not.toHaveBeenCalled();
  });

  it('4. DISABLED organization → processing skipped', async () => {
    prisma.organization.findMany.mockResolvedValueOnce([
      { id: 'org-disabled', name: 'Disabled Org', controlStateProjection: { state: 'DISABLED' } },
    ]);

    await cron.handleWeeklyDigest();

    expect(effectiveServiceStateResolver.resolveEffectiveState).not.toHaveBeenCalled();
    expect(resendMailerService.sendEmail).not.toHaveBeenCalled();
  });

  it('5. DECOMMISSIONED organization → processing skipped', async () => {
    prisma.organization.findMany.mockResolvedValueOnce([
      { id: 'org-decom', name: 'Decom Org', controlStateProjection: { state: 'DECOMMISSIONED' } },
    ]);

    await cron.handleWeeklyDigest();

    expect(effectiveServiceStateResolver.resolveEffectiveState).not.toHaveBeenCalled();
    expect(resendMailerService.sendEmail).not.toHaveBeenCalled();
  });

  it('6. commercially unlicensed organization → processing skipped globally', async () => {
    licenseVerificationService.getEvaluatedState.mockResolvedValueOnce({ state: 'EXPIRED' });

    await cron.handleWeeklyDigest();

    expect(prisma.organization.findMany).not.toHaveBeenCalled();
    expect(resendMailerService.sendEmail).not.toHaveBeenCalled();
  });

  it('7. one organization disabled → unrelated organizations continue processing normally', async () => {
    prisma.organization.findMany.mockResolvedValueOnce([
      { id: 'org-disabled', name: 'Disabled Org', controlStateProjection: { state: 'DISABLED' } },
      { id: 'org-active', name: 'Active Org', controlStateProjection: { state: 'ACTIVE' } },
    ]);
    prisma.notification.findFirst.mockResolvedValueOnce(null);
    prisma.user.findMany.mockResolvedValueOnce([
      { id: 'user-active', email: 'admin@active.com', name: 'Active Admin' },
    ]);

    await cron.handleWeeklyDigest();

    expect(resendMailerService.sendEmail).toHaveBeenCalledTimes(1);
    expect(resendMailerService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-active',
      }),
      expect.anything(),
    );
  });

  it('8. no accidental global disablement when single tenant is disabled', async () => {
    prisma.organization.findMany.mockResolvedValueOnce([
      { id: 'org-disabled-cap', name: 'Disabled Cap Org', controlStateProjection: { state: 'ACTIVE' } },
      { id: 'org-enabled-cap', name: 'Enabled Cap Org', controlStateProjection: { state: 'ACTIVE' } },
    ]);

    // Mock org-disabled-cap to be disabled, org-enabled-cap to be available
    effectiveServiceStateResolver.resolveEffectiveState
      .mockResolvedValueOnce({ isAvailable: false, effectiveState: 'DISABLED', reason: 'Disabled' })
      .mockResolvedValueOnce({ isAvailable: true, effectiveState: 'AVAILABLE', reason: 'Active' });

    prisma.notification.findFirst.mockResolvedValueOnce(null);
    prisma.user.findMany.mockResolvedValueOnce([
      { id: 'user-2', email: 'admin@enabled.com', name: 'Enabled Admin' },
    ]);

    await cron.handleWeeklyDigest();

    expect(resendMailerService.sendEmail).toHaveBeenCalledTimes(1);
    expect(resendMailerService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-enabled-cap',
      }),
      expect.anything(),
    );
  });

  it('9. no sensitive information logged', async () => {
    const loggerSpy = jest.spyOn((cron as any).logger, 'debug');

    prisma.organization.findMany.mockResolvedValueOnce([
      { id: 'org-sensitive', name: 'Sensitive Org', controlStateProjection: { state: 'SUSPENDED' } },
    ]);

    await cron.handleWeeklyDigest();

    const loggedMessages = loggerSpy.mock.calls.map((call) => call[0]).join(' ');
    expect(loggedMessages).not.toContain('password');
    expect(loggedMessages).not.toContain('jwt');
    expect(loggedMessages).not.toContain('secret');
    expect(loggedMessages).not.toContain('bearer');
  });

  it('10. no duplicate dispatch caused by control checks (idempotency guard check)', async () => {
    prisma.organization.findMany.mockResolvedValueOnce([
      { id: 'org-idempotent', name: 'Idempotent Org', controlStateProjection: { state: 'ACTIVE' } },
    ]);

    // Already dispatched earlier this week
    prisma.notification.findFirst.mockResolvedValueOnce({
      id: 'existing-digest-1',
      organizationId: 'org-idempotent',
      type: NotificationType.WEEKLY_DIGEST,
      createdAt: new Date(),
    });

    await cron.handleWeeklyDigest();

    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(resendMailerService.sendEmail).not.toHaveBeenCalled();
  });
});
