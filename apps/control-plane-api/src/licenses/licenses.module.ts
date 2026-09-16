import { Module } from '@nestjs/common';
import { LicensesService } from './licenses.service';
import { LicensesController } from './licenses.controller';
import { LicenseSigningService } from './license-signing.service';

@Module({
  providers: [LicensesService, LicenseSigningService],
  controllers: [LicensesController],
  exports: [LicensesService, LicenseSigningService],
})
export class LicensesModule {}
