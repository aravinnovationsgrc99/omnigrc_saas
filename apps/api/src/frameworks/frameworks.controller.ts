import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { FrameworksService } from './frameworks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { FrameworkItemDto, CustomFrameworkImportDto, Role } from '@omnigrc/shared';

@Controller('frameworks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FrameworksController {
  constructor(private readonly frameworksService: FrameworksService) {}

  @Get()
  async getFrameworks(): Promise<FrameworkItemDto[]> {
    return this.frameworksService.findAll();
  }

  @Get(':idOrCode')
  async getFramework(@Param('idOrCode') idOrCode: string): Promise<FrameworkItemDto> {
    return this.frameworksService.findOne(idOrCode);
  }

  @Get(':idOrCode/versions')
  async getVersions(@Param('idOrCode') idOrCode: string) {
    return this.frameworksService.getVersions(idOrCode);
  }

  @Get('versions/:versionId/references')
  async getReferences(@Param('versionId') versionId: string) {
    return this.frameworksService.getReferences(versionId);
  }

  @Post('import')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  async importFramework(@Body() dto: CustomFrameworkImportDto): Promise<FrameworkItemDto> {
    return this.frameworksService.importCustomFramework(dto);
  }
}
