import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { OperatorAuthService } from './operator-auth.service';
import { OperatorJwtGuard } from './operator-jwt.guard';
import {
  OperatorLoginDto,
  OperatorRefreshDto,
  VerifyMfaDto,
  BootstrapOperatorDto,
} from './dto/operator-auth.dto';

@Controller('v1/operator-auth')
export class OperatorAuthController {
  constructor(private readonly authService: OperatorAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: OperatorLoginDto, @Req() req: Request) {
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const correlationId = (req as any).correlationId;

    return this.authService.login(dto, ipAddress, userAgent, correlationId);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: OperatorRefreshDto, @Req() req: Request) {
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const correlationId = (req as any).correlationId;

    return this.authService.refresh(dto.refreshToken, ipAddress, userAgent, correlationId);
  }

  @Post('logout')
  @UseGuards(OperatorJwtGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: any) {
    const operator = req.user;
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';
    const correlationId = req.correlationId;

    await this.authService.logout(operator.sessionId, operator.id, ipAddress, correlationId);
    return { success: true, message: 'Logged out successfully' };
  }

  @Post('mfa/setup')
  @UseGuards(OperatorJwtGuard)
  @HttpCode(HttpStatus.OK)
  async setupMfa(@Req() req: any) {
    const operator = req.user;
    return this.authService.setupMfa(operator.id);
  }

  @Post('mfa/verify')
  @UseGuards(OperatorJwtGuard)
  @HttpCode(HttpStatus.OK)
  async verifyMfa(@Req() req: any, @Body() dto: VerifyMfaDto) {
    const operator = req.user;
    return this.authService.verifyAndEnableMfa(operator.id, dto.totpCode);
  }

  @Post('bootstrap')
  @HttpCode(HttpStatus.CREATED)
  async bootstrap(@Body() dto: BootstrapOperatorDto, @Req() req: Request) {
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';
    const correlationId = (req as any).correlationId;

    return this.authService.bootstrapOperator(dto, ipAddress, correlationId);
  }
}
