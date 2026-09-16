import { Module, Global } from '@nestjs/common';
import { ControlPlanePrismaService } from './prisma.service';

@Global()
@Module({
  providers: [ControlPlanePrismaService],
  exports: [ControlPlanePrismaService],
})
export class ControlPlanePrismaModule {}
