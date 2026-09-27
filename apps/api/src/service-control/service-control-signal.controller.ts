import { Controller, Post, Body, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { ServiceControlSignalService } from './service-control-signal.service';
import { GlobalServiceSignalDto } from './dto/global-service-signal.dto';
import { OrgServiceOverrideSignalDto } from './dto/org-service-override-signal.dto';

@Controller('v1/control-signals')
export class ServiceControlSignalController {
  constructor(private readonly signalService: ServiceControlSignalService) {}

  @Post('global-service-state')
  @HttpCode(HttpStatus.OK)
  async handleGlobalServiceSignal(
    @Body() dto: GlobalServiceSignalDto,
    @Headers('x-control-plane-secret') headerSecret?: string,
  ) {
    return this.signalService.processGlobalServiceSignal(dto, headerSecret);
  }

  @Post('organization-service-override')
  @HttpCode(HttpStatus.OK)
  async handleOrgServiceOverrideSignal(
    @Body() dto: OrgServiceOverrideSignalDto,
    @Headers('x-control-plane-secret') headerSecret?: string,
  ) {
    return this.signalService.processOrgServiceOverrideSignal(dto, headerSecret);
  }
}
