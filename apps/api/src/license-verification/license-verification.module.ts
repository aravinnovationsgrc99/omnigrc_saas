import { Module, Global } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LicenseVerificationService } from './license-verification.service';
import { LicenseActivationClientService } from './license-activation.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [LicenseVerificationService, LicenseActivationClientService],
  exports: [LicenseVerificationService, LicenseActivationClientService],
})
export class LicenseVerificationModule {}

