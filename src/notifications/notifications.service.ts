import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MailService } from '../mail/mail.service';
import type { NotificationType } from '../shared/domain/enums';
import { UsersService } from '../users/users.service';
import { Notification, NotificationDocument } from './schemas/notification.schema';

export interface EmitNotification {
  userId: string;
  type: NotificationType;
  text: string;
  target: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly appUrl: string;

  constructor(
    @InjectModel(Notification.name) private readonly notificationModel: Model<Notification>,
    private readonly users: UsersService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.appUrl = (config.get<string>('APP_URL') || 'http://localhost:4200').replace(/\/$/, '');
  }

  // Creates the in-app notification and, as a side effect, emails the recipient the same event. The
  // email is fire-and-forget so a slow or failing mailer never blocks the lifecycle action.
  async emit(input: EmitNotification): Promise<void> {
    await this.notificationModel.create({ ...input, date: new Date(), read: false });
    void this.sendEmail(input).catch((error) =>
      this.logger.error(
        `No se pudo enviar el email de la notificación a ${input.userId}`,
        error as Error,
      ),
    );
  }

  private async sendEmail(input: EmitNotification): Promise<void> {
    const user = await this.users.findById(input.userId);
    if (!user) return;
    await this.mail.sendLifecycleNotification(
      user.email,
      user.name,
      input.type,
      input.text,
      `${this.appUrl}${input.target}`,
    );
  }

  byUser(userId: string): Promise<NotificationDocument[]> {
    return this.notificationModel.find({ userId }).sort({ date: -1 }).exec();
  }

  async unreadCountFor(userId: string): Promise<{ count: number }> {
    const count = await this.notificationModel.countDocuments({ userId, read: false }).exec();
    return { count };
  }

  async markRead(id: string, userId: string): Promise<NotificationDocument> {
    const notification = await this.notificationModel
      .findOneAndUpdate({ _id: id, userId }, { read: true }, { returnDocument: 'after' })
      .exec();
    if (!notification) {
      throw new NotFoundException(`Notificación no encontrada: ${id}`);
    }
    return notification;
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationModel
      .updateMany({ userId, read: false }, { read: true })
      .exec();
    return { updated: result.modifiedCount };
  }
}
