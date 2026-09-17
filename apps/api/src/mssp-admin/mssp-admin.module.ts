import { Module } from '@nestjs/common';
import { MsspAdminService } from './mssp-admin.service';
import { MsspAdminController } from './mssp-admin.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [MsspAdminService],
  controllers: [MsspAdminController],
  exports: [MsspAdminService],
})
export class MsspAdminModule {}
