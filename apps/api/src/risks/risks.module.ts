import { Module } from '@nestjs/common';
import { RisksService } from './risks.service';
import { RisksController } from './risks.controller';
import { AuthModule } from '../auth/auth.module';
import { RiskControlsModule } from '../risk-controls/risk-controls.module';
import { FrameworksModule } from '../frameworks/frameworks.module';

@Module({
  imports: [AuthModule, RiskControlsModule, FrameworksModule],
  controllers: [RisksController],
  providers: [RisksService],
  exports: [RisksService],
})
export class RisksModule {}
