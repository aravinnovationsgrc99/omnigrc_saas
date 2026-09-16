import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/control-plane-client';

@Injectable()
export class ControlPlanePrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      datasources: {
        db: {
          url:
            process.env.CONTROL_PLANE_DIRECT_URL ||
            process.env.CONTROL_PLANE_DATABASE_URL ||
            'postgresql://postgres.wzkccgutcqjjxidwiwcx:N3Tn8UovDLpBHuXm@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
        },
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
