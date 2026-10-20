import { Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '@omnigrc/shared';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getNotifications(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const userId = user.userId || user.id || user.sub;
    return this.notificationsService.getUserNotifications(user.organizationId, userId, { page, limit });
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: any) {
    const userId = user.userId || user.id || user.sub;
    const count = await this.notificationsService.getUnreadCount(user.organizationId, userId);
    return { unreadCount: count };
  }

  @Patch(':id/read')
  async markRead(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const userId = user.userId || user.id || user.sub;
    return this.notificationsService.markRead(user.organizationId, userId, id);
  }

  @Patch('mark-all-read')
  async markAllRead(@CurrentUser() user: any) {
    const userId = user.userId || user.id || user.sub;
    return this.notificationsService.markAllRead(user.organizationId, userId);
  }
}
