import { Module, Global, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FrameworksModule } from '../frameworks/frameworks.module';
import { LicenseVerificationService } from './license-verification.service';
import { LicenseActivationClientService } from './license-activation.service';

@Global()
@Module({
  imports: [PrismaModule, forwardRef(() => FrameworksModule)],
  providers: [LicenseVerificationService, LicenseActivationClientService],
  exports: [LicenseVerificationService, LicenseActivationClientService],
})
export class LicenseVerificationModule {}

