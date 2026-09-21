import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResourceAuthorizationGuard } from '../auth/guards/resource-authorization.guard';
import { RequireResourceScope } from '../auth/decorators/require-resource-scope.decorator';
import { CreateDepartmentDto, UpdateDepartmentDto, ResourceScopeType } from '@omnigrc/shared';

@Controller('departments')
@UseGuards(JwtAuthGuard, ResourceAuthorizationGuard)
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @RequireResourceScope({ action: 'READ', scopeType: ResourceScopeType.DEPARTMENT })
  async findAll(@Req() req: any) {
    return this.departmentsService.findAll(req.user.organizationId);
  }

  @Get(':id')
  @RequireResourceScope({ action: 'READ', scopeType: ResourceScopeType.DEPARTMENT })
  async findOne(@Req() req: any, @Param('id') id: string) {
    return this.departmentsService.findOne(req.user.organizationId, id);
  }

  @Post()
  @RequireResourceScope({ action: 'ADMIN', scopeType: ResourceScopeType.DEPARTMENT })
  async create(@Req() req: any, @Body() dto: CreateDepartmentDto) {
    return this.departmentsService.create(req.user.organizationId, req.user.sub || req.user.id, dto);
  }

  @Patch(':id')
  @RequireResourceScope({ action: 'ADMIN', scopeType: ResourceScopeType.DEPARTMENT })
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.departmentsService.update(req.user.organizationId, req.user.sub || req.user.id, id, dto);
  }

  @Delete(':id')
  @RequireResourceScope({ action: 'ADMIN', scopeType: ResourceScopeType.DEPARTMENT })
  async remove(@Req() req: any, @Param('id') id: string) {
    await this.departmentsService.remove(req.user.organizationId, req.user.sub || req.user.id, id);
    return { success: true, message: `Department ${id} removed successfully.` };
  }
}
