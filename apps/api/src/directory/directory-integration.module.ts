import { Module } from '@nestjs/common';
import { DirectoryIntegrationService } from './directory-integration.service';
import { DirectoryIntegrationController } from './directory-integration.controller';
import { DirectoryGraphClient } from './directory-graph.client';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuditLogsModule, AuthModule],
  controllers: [DirectoryIntegrationController],
  providers: [DirectoryIntegrationService, DirectoryGraphClient],
  exports: [DirectoryIntegrationService, DirectoryGraphClient],
})
export class DirectoryIntegrationModule {}

