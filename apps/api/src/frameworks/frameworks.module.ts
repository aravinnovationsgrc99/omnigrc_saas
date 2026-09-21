import { Module } from '@nestjs/common';
import { FrameworksService } from './frameworks.service';
import { FrameworksController } from './frameworks.controller';
import { FrameworkEntitlementsService } from './framework-entitlements.service';
import { FrameworkEntitlementGuard } from './guards/framework-entitlement.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [FrameworksService, FrameworkEntitlementsService, FrameworkEntitlementGuard],
  controllers: [FrameworksController],
  exports: [FrameworksService, FrameworkEntitlementsService, FrameworkEntitlementGuard],
})
export class FrameworksModule {}
