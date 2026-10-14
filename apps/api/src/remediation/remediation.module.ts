import { Module } from '@nestjs/common';
import { RemediationService } from './remediation.service';
import { RemediationController } from './remediation.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ServiceControlModule } from '../service-control/service-control.module';

@Module({
  imports: [PrismaModule, ServiceControlModule],
  providers: [RemediationService],
  controllers: [RemediationController],
  exports: [RemediationService],
})
export class RemediationModule {}
