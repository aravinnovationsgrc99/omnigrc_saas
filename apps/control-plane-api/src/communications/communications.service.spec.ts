import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  AnnouncementAudience,
  AnnouncementSeverity,
  AnnouncementStatus,
  EmailDeliveryStatus,
} from '@prisma/control-plane-client';
import { ControlPlaneCommunicationsService } from './communications.service';
import { ControlPlanePrismaService } from '../prisma/prisma.service';
import { ControlPlaneAuditLogsService } from '../audit/audit-logs.service';
import { ControlPlaneEmailService } from './email.service';

describe('ControlPlaneCommunicationsService', () => {
  let service: ControlPlaneCommunicationsService;
  let prismaService: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<any>;
  let emailService: jest.Mocked<any>;

  const mockOperatorId = 'op_admin_123';

  beforeEach(async () => {
    prismaService = {
      platformAnnouncement: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      organizationControlState: {
        findUnique: jest.fn(),
      },
      operator: {
        findMany: jest.fn(),
      },
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({}),
    };

    emailService = {
      sendPlatformEmail: jest.fn().mockResolvedValue({ success: true, recipientCount: 5 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ControlPlaneCommunicationsService,
        { provide: ControlPlanePrismaService, useValue: prismaService },
        { provide: ControlPlaneAuditLogsService, useValue: auditLogsService },
        { provide: ControlPlaneEmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get<ControlPlaneCommunicationsService>(ControlPlaneCommunicationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a DRAFT announcement successfully and sanitize script tags', async () => {
      const mockRecord = {
        id: 'ann_123',
        title: 'Maintenance Notice',
        body: 'Scheduled system maintenance tomorrow.',
        severity: AnnouncementSeverity.WARNING,
        status: AnnouncementStatus.DRAFT,
        audience: AnnouncementAudience.ALL_ORGANIZATIONS,
        targetOrganizationId: null,
        createdByOperatorId: mockOperatorId,
        sendEmail: true,
      };

      prismaService.platformAnnouncement.create.mockResolvedValue(mockRecord);

      const result = await service.create(
        {
          title: 'Maintenance Notice <script>alert(1)</script>',
          body: 'Scheduled system maintenance tomorrow.',
          severity: AnnouncementSeverity.WARNING,
          sendEmail: true,
        },
        mockOperatorId,
      );

      expect(result).toEqual(mockRecord);
      expect(prismaService.platformAnnouncement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Maintenance Notice',
            severity: AnnouncementSeverity.WARNING,
            status: AnnouncementStatus.DRAFT,
            sendEmail: true,
          }),
        }),
      );
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ANNOUNCEMENT_CREATED',
          entityType: 'PlatformAnnouncement',
          entityId: 'ann_123',
        }),
      );
    });

    it('should reject short title or body', async () => {
      await expect(
        service.create({ title: 'Hi', body: 'Valid body text' }, mockOperatorId),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create({ title: 'Valid Title', body: '1234' }, mockOperatorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate target organization exists if audience is SPECIFIC_ORGANIZATION', async () => {
      prismaService.organizationControlState.findUnique.mockResolvedValue(null);

      await expect(
        service.create(
          {
            title: 'Targeted Advisory',
            body: 'Organization specific notice.',
            audience: AnnouncementAudience.SPECIFIC_ORGANIZATION,
            targetOrganizationId: 'org_nonexistent',
          },
          mockOperatorId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('publish', () => {
    it('should publish a DRAFT announcement and trigger email dispatch if enabled', async () => {
      const existingDraft = {
        id: 'ann_123',
        title: 'Security Advisory',
        body: 'Please patch immediately.',
        severity: AnnouncementSeverity.CRITICAL,
        status: AnnouncementStatus.DRAFT,
        audience: AnnouncementAudience.ALL_OPERATORS,
        targetOrganizationId: null,
        sendEmail: true,
      };

      prismaService.platformAnnouncement.findUnique.mockResolvedValue(existingDraft);
      prismaService.operator.findMany.mockResolvedValue([
        { email: 'op1@omnigrc.co' },
        { email: 'op2@omnigrc.co' },
      ]);
      prismaService.platformAnnouncement.update.mockResolvedValue({
        ...existingDraft,
        status: AnnouncementStatus.PUBLISHED,
        emailDeliveryStatus: EmailDeliveryStatus.SENT,
        emailRecipientCount: 2,
      });

      const published = await service.publish('ann_123', mockOperatorId);

      expect(published.status).toEqual(AnnouncementStatus.PUBLISHED);
      expect(emailService.sendPlatformEmail).toHaveBeenCalledWith({
        to: ['op1@omnigrc.co', 'op2@omnigrc.co'],
        subject: 'Security Advisory',
        bodyText: 'Please patch immediately.',
        announcementId: 'ann_123',
      });
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ANNOUNCEMENT_PUBLISHED',
          entityId: 'ann_123',
        }),
      );
    });

    it('should reject publishing an already published announcement', async () => {
      prismaService.platformAnnouncement.findUnique.mockResolvedValue({
        id: 'ann_123',
        status: AnnouncementStatus.PUBLISHED,
      });

      await expect(service.publish('ann_123', mockOperatorId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('update', () => {
    it('should reject editing a PUBLISHED announcement', async () => {
      prismaService.platformAnnouncement.findUnique.mockResolvedValue({
        id: 'ann_123',
        status: AnnouncementStatus.PUBLISHED,
      });

      await expect(
        service.update('ann_123', { title: 'New Title' }, mockOperatorId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('should cancel a DRAFT announcement successfully', async () => {
      const existingDraft = {
        id: 'ann_123',
        status: AnnouncementStatus.DRAFT,
        title: 'Draft to cancel',
      };

      prismaService.platformAnnouncement.findUnique.mockResolvedValue(existingDraft);
      prismaService.platformAnnouncement.update.mockResolvedValue({
        ...existingDraft,
        status: AnnouncementStatus.CANCELLED,
      });

      const cancelled = await service.cancel('ann_123', mockOperatorId);

      expect(cancelled.status).toEqual(AnnouncementStatus.CANCELLED);
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ANNOUNCEMENT_CANCELLED',
          entityId: 'ann_123',
        }),
      );
    });
  });
});
