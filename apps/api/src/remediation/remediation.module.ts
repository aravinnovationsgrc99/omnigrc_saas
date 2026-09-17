import { Module } from '@nestjs/common';
import { RemediationService } from './remediation.service';
import { RemediationController } from './remediation.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [RemediationService],
  controllers: [RemediationController],
  exports: [RemediationService],
})
export class RemediationModule {}
