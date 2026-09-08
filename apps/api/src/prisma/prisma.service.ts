import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantContext } from '../tenant/tenant.context';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();

    // Attach middleware for row-level tenant scoping at application layer
    this.$use(async (params, next) => {
      const orgId = TenantContext.getOrganizationId();
      const tenantModels = ['User', 'RegionalPod', 'AuditLogEntry'];

      if (orgId && params.model && tenantModels.includes(params.model)) {
        if (['findUnique', 'findFirst', 'findMany', 'count', 'update', 'updateMany', 'delete', 'deleteMany'].includes(params.action)) {
          params.args = params.args || {};
          params.args.where = params.args.where || {};
          if (!params.args.where.organizationId) {
            params.args.where.organizationId = orgId;
          }
        }

        if (['create', 'createMany'].includes(params.action)) {
          params.args = params.args || {};
          if (params.action === 'create' && params.args.data && !params.args.data.organizationId) {
            params.args.data.organizationId = orgId;
          }
        }
      }

      return next(params);
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
