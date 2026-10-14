import { Module } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { AssetsController } from './assets.controller';
import { AuthModule } from '../auth/auth.module';
import { RisksModule } from '../risks/risks.module';

@Module({
  imports: [AuthModule, RisksModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
