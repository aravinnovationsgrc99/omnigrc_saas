import { Module } from '@nestjs/common';
import { RiskControlsService } from './risk-controls.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [RiskControlsService],
  exports: [RiskControlsService],
})
export class RiskControlsModule {}
