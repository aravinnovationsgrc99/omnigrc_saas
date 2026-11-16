import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class DataPlanePrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DataPlanePrismaService.name);

  constructor() {
    super({
      datasources: {
        db: {
          url:
            process.env.DATABASE_URL ||
            process.env.DIRECT_URL ||
            process.env.CONTROL_PLANE_DATABASE_URL,
        },
      },
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Connected to Data Plane database for framework synchronization.');
    } catch (err: any) {
      this.logger.warn(
        `DataPlanePrismaService could not connect to data plane database (${err.message}). Framework sync will be unavailable until connection is established.`,
      );
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
    } catch {}
  }
}

