import { Module } from '@nestjs/common';
import { RisksService } from './risks.service';
import { RisksController } from './risks.controller';
import { AuthModule } from '../auth/auth.module';
import { RiskControlsModule } from '../risk-controls/risk-controls.module';
import { FrameworksModule } from '../frameworks/frameworks.module';
import { ApprovalEngineModule } from '../approval/approval-engine.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuthModule, RiskControlsModule, FrameworksModule, ApprovalEngineModule, NotificationsModule],
  controllers: [RisksController],
  providers: [RisksService],
  exports: [RisksService],
})
export class RisksModule {}
