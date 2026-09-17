import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ExcelExportService } from './excel-export.service';
import { ReportsRegistry } from './reports.registry';
import { PrismaModule } from '../prisma/prisma.module';
import { MetricsModule } from '../metrics/metrics.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [PrismaModule, MetricsModule, AuditLogsModule],
  controllers: [ReportsController],
  providers: [ReportsService, ExcelExportService, ReportsRegistry],
  exports: [ReportsService],
})
export class ReportsModule {}
