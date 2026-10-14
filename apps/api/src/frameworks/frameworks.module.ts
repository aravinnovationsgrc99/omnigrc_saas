import { Module, forwardRef } from '@nestjs/common';
import { FrameworksService } from './frameworks.service';
import { FrameworksController } from './frameworks.controller';
import { FrameworkEntitlementsService } from './framework-entitlements.service';
import { FrameworkCoverageService } from './framework-coverage.service';
import { FrameworkEntitlementGuard } from './guards/framework-entitlement.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ServiceControlModule } from '../service-control/service-control.module';

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule), forwardRef(() => ServiceControlModule)],
  providers: [
    FrameworksService,
    FrameworkEntitlementsService,
    FrameworkCoverageService,
    FrameworkEntitlementGuard,
  ],
  controllers: [FrameworksController],
  exports: [
    FrameworksService,
    FrameworkEntitlementsService,
    FrameworkCoverageService,
    FrameworkEntitlementGuard,
  ],
})
export class FrameworksModule {}

