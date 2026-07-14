import { Controller, Get, Param, Patch } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { SessionUser } from '../auth/session-user';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  byUser(@CurrentUser() user: SessionUser) {
    return this.notifications.byUser(user.id);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: SessionUser) {
    return this.notifications.unreadCountFor(user.id);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: SessionUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.notifications.markRead(id, user.id);
  }
}
