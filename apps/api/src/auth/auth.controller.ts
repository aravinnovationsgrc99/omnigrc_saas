import { Controller, Post, Get, Patch, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { Role, OnboardingCompleteDto, InviteTeamMemberDto } from '@omnigrc/shared';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: any) {
    return this.authService.register(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: any) {
    return this.authService.login(body);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout() {
    return { message: 'Signed out successfully' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser('userId') userId: string) {
    return this.authService.getMe(userId);
  }

  @Patch('me/preferences')
  @UseGuards(JwtAuthGuard)
  async updatePreferences(
    @CurrentUser('userId') userId: string,
    @Body('emailNotifications') emailNotifications: boolean,
  ) {
    return this.authService.updatePreferences(userId, emailNotifications);
  }

  @Post('onboarding/complete')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async completeOnboarding(
    @CurrentUser('userId') userId: string,
    @Body() dto: OnboardingCompleteDto,
  ) {
    return this.authService.completeOnboarding(userId, dto);
  }

  @Post('onboarding/invite')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async inviteTeamMember(
    @CurrentUser('userId') userId: string,
    @Body() dto: InviteTeamMemberDto,
  ) {
    return this.authService.inviteTeamMember(userId, dto);
  }
}
