import { Module, Global } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FrameworksModule } from '../frameworks/frameworks.module';
import { LicenseVerificationService } from './license-verification.service';
import { LicenseActivationClientService } from './license-activation.service';

@Global()
@Module({
  imports: [PrismaModule, FrameworksModule],
  providers: [LicenseVerificationService, LicenseActivationClientService],
  exports: [LicenseVerificationService, LicenseActivationClientService],
})
export class LicenseVerificationModule {}

