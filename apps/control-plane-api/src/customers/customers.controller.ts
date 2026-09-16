import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { ControlPlaneAdminGuard } from '../auth/control-plane-admin.guard';
import { CreateCustomerDto, CreateCommercialAgreementDto } from '@omnigrc/shared';

@Controller('v1')
@UseGuards(ControlPlaneAdminGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post('customers')
  @HttpCode(HttpStatus.CREATED)
  async createCustomer(@Body() dto: CreateCustomerDto) {
    return this.customersService.createCustomer(dto);
  }

  @Get('customers/:id')
  async findCustomer(@Param('id') id: string) {
    return this.customersService.findCustomer(id);
  }

  @Post('commercial-agreements')
  @HttpCode(HttpStatus.CREATED)
  async createCommercialAgreement(@Body() dto: CreateCommercialAgreementDto) {
    return this.customersService.createCommercialAgreement(dto);
  }

  @Get('commercial-agreements/:id')
  async findCommercialAgreement(@Param('id') id: string) {
    return this.customersService.findCommercialAgreement(id);
  }
}
