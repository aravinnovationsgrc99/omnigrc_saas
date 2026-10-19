import { Module } from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { VendorsController } from './vendors.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AuthModule } from '../auth/auth.module';
import { EvidenceVaultModule } from '../evidence/evidence-vault.module';
import { ApprovalEngineModule } from '../approval/approval-engine.module';

@Module({
  imports: [PrismaModule, AuditLogsModule, AuthModule, EvidenceVaultModule, ApprovalEngineModule],
  controllers: [VendorsController],
  providers: [VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
