import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditLogsService } from '../src/audit-logs/audit-logs.service';
import { ResendMailerService } from '../src/notifications/mailer/resend-mailer.service';
import { SlackNotifierService } from '../src/notifications/slack/slack-notifier.service';

interface RbacRouteConfig {
  method: 'get' | 'post' | 'patch';
  path: string;
  payload?: any;
  allowedRoles: ('ADMIN' | 'ANALYST')[];
}

describe('RBAC & Unauthenticated Access Regression Test Suite', () => {
  let app: INestApplication;
  let adminToken: string;
  let analystToken: string;
  let jwtService: JwtService;

  beforeAll(async () => {
    jwtService = new JwtService({
      secret: process.env.JWT_SECRET || 'omnigrc-dev-secret-key-change-in-prod',
    });

    adminToken = jwtService.sign({
      sub: 'user-admin-1',
      email: 'admin@omnigrc-test.com',
      organizationId: 'org-test-1',
      role: 'ADMIN',
    });

    analystToken = jwtService.sign({
      sub: 'user-analyst-1',
      email: 'analyst@omnigrc-test.com',
      organizationId: 'org-test-1',
      role: 'ANALYST',
    });

    const mockPrisma = {
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
      $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
      asset: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({
          id: 'asset-1',
          organizationId: 'org-test-1',
          name: 'Test Asset',
          type: 'SOFTWARE',
          owner: 'DevOps',
          criticality: 'MEDIUM',
          createdAt: new Date(),
          updatedAt: new Date(),
          createdById: 'user-1',
        }),
      },
      risk: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({
          id: 'risk-1',
          organizationId: 'org-test-1',
          title: 'Test Risk',
          likelihood: 3,
          impact: 3,
          score: 9,
          scoreBand: 'MEDIUM',
          status: 'OPEN',
          owner: 'SecOps',
          createdAt: new Date(),
          updatedAt: new Date(),
          createdById: 'user-1',
        }),
      },
      control: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({
          id: 'ctrl-1',
          organizationId: 'org-test-1',
          name: 'Test Control',
          category: 'Access Control',
          createdAt: new Date(),
          updatedAt: new Date(),
          createdById: 'user-1',
          mappings: [],
        }),
      },
      complianceTask: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({
          id: 'task-1',
          organizationId: 'org-test-1',
          title: 'Test Task',
          status: 'NOT_STARTED',
          owner: 'Analyst',
          createdAt: new Date(),
          updatedAt: new Date(),
          createdById: 'user-1',
        }),
      },
      auditLogEntry: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      regionalPod: {
        findFirst: jest.fn().mockResolvedValue({ id: 'pod-1', status: 'INACTIVE', organizationId: 'org-test-1' }),
        count: jest.fn().mockResolvedValue(2),
        update: jest.fn().mockResolvedValue({ id: 'pod-1', status: 'ACTIVE' }),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ id: 'org-test-1', name: 'Test Org' }),
        update: jest.fn().mockResolvedValue({ id: 'org-test-1', name: 'Test Org' }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === 'user-admin-1') {
            return Promise.resolve({
              id: 'user-admin-1',
              email: 'admin@omnigrc-test.com',
              organizationId: 'org-test-1',
              role: 'ADMIN',
              name: 'RBAC Admin',
            });
          }
          if (where.id === 'user-analyst-1') {
            return Promise.resolve({
              id: 'user-analyst-1',
              email: 'analyst@omnigrc-test.com',
              organizationId: 'org-test-1',
              role: 'ANALYST',
              name: 'RBAC Analyst',
            });
          }
          return Promise.resolve(null);
        }),
        create: jest.fn().mockResolvedValue({ id: 'user-new', email: 'test_invite@omnigrc-test.com', role: 'ANALYST' }),
      },
      notification: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const mockAuditLogs = {
      log: jest.fn().mockResolvedValue({}),
      findPaginatedForOrg: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(AuditLogsService)
      .useValue(mockAuditLogs)
      .overrideProvider(ResendMailerService)
      .useValue({ sendEmail: jest.fn().mockResolvedValue(true) })
      .overrideProvider(SlackNotifierService)
      .useValue({ sendSlackAlert: jest.fn().mockResolvedValue(true) })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  const routesToTest: RbacRouteConfig[] = [
    { method: 'get', path: '/assets', allowedRoles: ['ADMIN', 'ANALYST'] },
    {
      method: 'post',
      path: '/assets',
      payload: { name: 'Test Asset', type: 'SOFTWARE', owner: 'DevOps', criticality: 'MEDIUM' },
      allowedRoles: ['ADMIN', 'ANALYST'],
    },
    { method: 'get', path: '/risks', allowedRoles: ['ADMIN', 'ANALYST'] },
    {
      method: 'post',
      path: '/risks',
      payload: { title: 'Test Risk', likelihood: 3, impact: 3, owner: 'SecOps' },
      allowedRoles: ['ADMIN', 'ANALYST'],
    },
    { method: 'get', path: '/controls', allowedRoles: ['ADMIN', 'ANALYST'] },
    {
      method: 'post',
      path: '/controls',
      payload: { name: 'Test Control', description: 'Access control policy description', category: 'Access Control' },
      allowedRoles: ['ADMIN', 'ANALYST'],
    },
    { method: 'get', path: '/compliance-tasks', allowedRoles: ['ADMIN', 'ANALYST'] },
    {
      method: 'post',
      path: '/compliance-tasks',
      payload: { title: 'Test Task', owner: 'Analyst' },
      allowedRoles: ['ADMIN', 'ANALYST'],
    },
    // ADMIN ONLY ROUTES
    { method: 'get', path: '/audit-log', allowedRoles: ['ADMIN'] },
    {
      method: 'patch',
      path: '/regional-pods/pod-1',
      payload: { status: 'ACTIVE' },
      allowedRoles: ['ADMIN'],
    },
    {
      method: 'post',
      path: '/integrations/slack/webhook-url',
      payload: { webhookUrl: 'https://hooks.slack.com/services/T00/B00/XXX' },
      allowedRoles: ['ADMIN'],
    },
    {
      method: 'post',
      path: '/auth/onboarding/invite',
      payload: { email: 'test_invite@omnigrc-test.com', role: 'ANALYST' },
      allowedRoles: ['ADMIN'],
    },
  ];

  routesToTest.forEach((route) => {
    it(`Unauthenticated Call to ${route.method.toUpperCase()} ${route.path} should return 401 Unauthorized`, async () => {
      const req = request(app.getHttpServer())[route.method](route.path);
      if (route.payload) req.send(route.payload);
      await req.expect(401);
    });

    const isAnalystForbidden = !route.allowedRoles.includes('ANALYST');
    if (isAnalystForbidden) {
      it(`ANALYST User calling ADMIN-only ${route.method.toUpperCase()} ${route.path} should return 403 Forbidden`, async () => {
        const req = request(app.getHttpServer())[route.method](route.path)
          .set('Authorization', `Bearer ${analystToken}`);
        if (route.payload) req.send(route.payload);

        const res = await req.expect(403);
        expect(res.body.statusCode).toBe(403);
        expect(res.body.error).toBe('Forbidden');
      });

      it(`ADMIN User calling ADMIN-only ${route.method.toUpperCase()} ${route.path} should be ALLOWED (200/201)`, async () => {
        const req = request(app.getHttpServer())[route.method](route.path)
          .set('Authorization', `Bearer ${adminToken}`);
        if (route.payload) req.send(route.payload);

        const res = await req;
        expect([200, 201]).toContain(res.status);
      });
    } else {
      it(`ANALYST User calling ${route.method.toUpperCase()} ${route.path} should be ALLOWED (200/201)`, async () => {
        const req = request(app.getHttpServer())[route.method](route.path)
          .set('Authorization', `Bearer ${analystToken}`);
        if (route.payload) req.send(route.payload);

        const res = await req;
        expect([200, 201]).toContain(res.status);
      });
    }
  });
});
