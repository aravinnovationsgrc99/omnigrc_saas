import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { BypassLicenseCheck } from '../common/decorators/requires-active-license.decorator';
import {
  Role,
  OnboardingCompleteDto,
  InviteTeamMemberDto,
  CreateInvitationDto,
  AcceptInvitationDto,
  SetupPasswordDto,
  SwitchContextDto,
} from '@omnigrc/shared';

@Controller('auth')
@BypassLicenseCheck()
export class AuthController {
  constructor(private readonly authService: AuthService) {}


  @Post('switch-context')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  @HttpCode(HttpStatus.OK)
  async switchContext(
    @CurrentUser('userId') userId: string,
    @CurrentUser('organizationId') homeOrgId: string,
    @CurrentUser('role') userRole: Role,
    @Body() dto: SwitchContextDto,
  ) {
    return this.authService.switchContext(userId, homeOrgId, userRole, dto);
  }

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

  // --- Secure Invitation System Endpoints ---

  @Post('invitations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createInvitation(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.authService.createInvitation(userId, dto);
  }

  @Get('invitations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async listInvitations(@CurrentUser('userId') userId: string) {
    return this.authService.listInvitations(userId);
  }

  @Get('invitations/validate')
  async validateInvitation(@Query('token') token: string) {
    return this.authService.validateInvitation(token);
  }

  @Post('invitations/accept')
  @HttpCode(HttpStatus.OK)
  async acceptInvitation(@Body() dto: AcceptInvitationDto) {
    return this.authService.acceptInvitation(dto);
  }

  @Post('invitations/:id/revoke')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async revokeInvitation(
    @CurrentUser('userId') userId: string,
    @Param('id') invitationId: string,
  ) {
    return this.authService.revokeInvitation(userId, invitationId);
  }

  @Post('invitations/:id/resend')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async resendInvitation(
    @CurrentUser('userId') userId: string,
    @Param('id') invitationId: string,
  ) {
    return this.authService.resendInvitation(userId, invitationId);
  }

  @Post('invitations/:id/copy-link')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async copyInviteLink(
    @CurrentUser('userId') userId: string,
    @Param('id') invitationId: string,
  ) {
    return this.authService.copyInviteLink(userId, invitationId);
  }

  @Post('setup-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async setupPassword(
    @CurrentUser('userId') userId: string,
    @Body() dto: SetupPasswordDto,
  ) {
    return this.authService.setupPassword(userId, dto);
  }
}
