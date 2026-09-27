import { Module, Global } from '@nestjs/common';
import { OrganizationControlSignalController } from './organization-control-signal.controller';
import { OrganizationControlSignalService } from './organization-control-signal.service';
import { PrismaModule } from '../prisma/prisma.module';
import { OrganizationControlStateGuard } from '../common/guards/organization-control-state.guard';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [OrganizationControlSignalController],
  providers: [OrganizationControlSignalService, OrganizationControlStateGuard],
  exports: [OrganizationControlSignalService, OrganizationControlStateGuard],
})
export class OrganizationControlModule {}
