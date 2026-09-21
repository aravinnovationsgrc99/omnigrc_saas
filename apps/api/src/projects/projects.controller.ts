import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResourceAuthorizationGuard } from '../auth/guards/resource-authorization.guard';
import { RequireResourceScope } from '../auth/decorators/require-resource-scope.decorator';
import { CreateProjectDto, UpdateProjectDto, ResourceScopeType } from '@omnigrc/shared';

@Controller('projects')
@UseGuards(JwtAuthGuard, ResourceAuthorizationGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @RequireResourceScope({ action: 'READ', scopeType: ResourceScopeType.PROJECT })
  async findAll(@Req() req: any, @Query('departmentId') departmentId?: string) {
    return this.projectsService.findAll(req.user.organizationId, departmentId);
  }

  @Get(':id')
  @RequireResourceScope({ action: 'READ', scopeType: ResourceScopeType.PROJECT })
  async findOne(@Req() req: any, @Param('id') id: string) {
    return this.projectsService.findOne(req.user.organizationId, id);
  }

  @Post()
  @RequireResourceScope({ action: 'WRITE', scopeType: ResourceScopeType.PROJECT })
  async create(@Req() req: any, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(req.user.organizationId, req.user.sub || req.user.id, dto);
  }

  @Patch(':id')
  @RequireResourceScope({ action: 'WRITE', scopeType: ResourceScopeType.PROJECT })
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(req.user.organizationId, req.user.sub || req.user.id, id, dto);
  }

  @Delete(':id')
  @RequireResourceScope({ action: 'ADMIN', scopeType: ResourceScopeType.PROJECT })
  async remove(@Req() req: any, @Param('id') id: string) {
    await this.projectsService.remove(req.user.organizationId, req.user.sub || req.user.id, id);
    return { success: true, message: `Project ${id} removed successfully.` };
  }
}
