import { Module } from '@nestjs/common';
import { ServiceControlSignalController } from './service-control-signal.controller';
import { ServiceControlSignalService } from './service-control-signal.service';
import { EffectiveServiceStateResolver } from './effective-service-state-resolver.service';
import { ServiceCapabilityGuard } from '../common/guards/service-capability.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { LicenseVerificationModule } from '../license-verification/license-verification.module';

@Module({
  imports: [PrismaModule, LicenseVerificationModule],
  controllers: [ServiceControlSignalController],
  providers: [
    ServiceControlSignalService,
    EffectiveServiceStateResolver,
    ServiceCapabilityGuard,
  ],
  exports: [
    ServiceControlSignalService,
    EffectiveServiceStateResolver,
    ServiceCapabilityGuard,
  ],
})
export class ServiceControlModule {}
