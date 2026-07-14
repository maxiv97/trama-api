import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { NotificationType } from '../shared/domain/enums';
import { Notification, NotificationDocument } from './schemas/notification.schema';

export interface EmitNotification {
  userId: string;
  type: NotificationType;
  text: string;
  target: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name) private readonly notificationModel: Model<Notification>,
  ) {}

  async emit(input: EmitNotification): Promise<void> {
    await this.notificationModel.create({ ...input, date: new Date(), read: false });
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
