import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LicenseVerificationService } from './license-verification.service';
import { LicenseActivationClientService } from './license-activation.service';

@Module({
  imports: [PrismaModule],
  providers: [LicenseVerificationService, LicenseActivationClientService],
  exports: [LicenseVerificationService, LicenseActivationClientService],
})
export class LicenseVerificationModule {}
