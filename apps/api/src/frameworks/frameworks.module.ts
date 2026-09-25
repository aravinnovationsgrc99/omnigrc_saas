import { Module } from '@nestjs/common';
import { FrameworksService } from './frameworks.service';
import { FrameworksController } from './frameworks.controller';
import { FrameworkEntitlementsService } from './framework-entitlements.service';
import { FrameworkCoverageService } from './framework-coverage.service';
import { FrameworkEntitlementGuard } from './guards/framework-entitlement.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
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

