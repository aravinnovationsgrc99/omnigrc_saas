import { Module } from '@nestjs/common';
import { EvidenceVaultService } from './evidence-vault.service';
import { EvidenceVaultController } from './evidence-vault.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [EvidenceVaultService],
  controllers: [EvidenceVaultController],
  exports: [EvidenceVaultService],
})
export class EvidenceVaultModule {}
