import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ControlPlaneM2MGuard } from '../provisioning/guards/control-plane-m2m.guard';
import { OrganizationControlSignalService } from './organization-control-signal.service';
import { ControlSignalDto } from './dto/control-signal.dto';

@Controller('v1/control-signals')
export class OrganizationControlSignalController {
  constructor(
    private readonly signalService: OrganizationControlSignalService,
  ) {}

  @Post('organization-state')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ControlPlaneM2MGuard)
  async receiveControlSignal(
    @Body() dto: ControlSignalDto,
    @Headers('x-control-plane-secret') headerSecret: string,
  ) {
    return this.signalService.processSignal(dto, headerSecret);
  }

  @Get('organization-state/:organizationId')
  async getProjectedState(@Param('organizationId') organizationId: string) {
    return this.signalService.getProjectedState(organizationId);
  }
}
