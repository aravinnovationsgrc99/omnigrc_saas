import { Module } from '@nestjs/common';
import { RegionalPodsService } from './regional-pods.service';
import { RegionalPodsController } from './regional-pods.controller';

@Module({
  controllers: [RegionalPodsController],
  providers: [RegionalPodsService],
  exports: [RegionalPodsService],
})
export class RegionalPodsModule {}
