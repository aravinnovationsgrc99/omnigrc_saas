import { Module } from '@nestjs/common';
import { PolicyControlsController } from './policy-controls.controller';
import { PolicyControlsService } from './policy-controls.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [PrismaModule, AuthModule, AuditLogsModule],
  controllers: [PolicyControlsController],
  providers: [PolicyControlsService],
  exports: [PolicyControlsService],
})
export class PolicyControlsModule {}

