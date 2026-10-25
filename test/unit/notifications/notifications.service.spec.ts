import { NotFoundException } from '@nestjs/common';
import {
  Notification,
  NotificationSchema,
} from '../../../src/notifications/schemas/notification.schema';
import { FakeDb } from '../../helpers/fake-model';
import { config, mailMock } from '../../helpers/world';
import { flush, newConsignor } from '../../helpers/fixtures';
import { buildWorld } from '../../helpers/world';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { UsersService } from '../../../src/users/users.service';
import { MailService } from '../../../src/mail/mail.service';

describe('NotificationsService', () => {
  it('guarda el aviso, lo manda por correo con el enlace y gestiona los leídos', async () => {
    const w = buildWorld();
    const c = await newConsignor(w);
    await w.notifications.emit({
      userId: c.id,
      type: 'sale',
      text: 'Vendimos',
      target: '/c/garment/1',
    });
    await w.notifications.emit({
      userId: c.id,
      type: 'payout',
      text: 'Pagamos',
      target: '/c',
    });
    await flush();
    expect(w.mail.sendLifecycleNotification).toHaveBeenCalledWith(
      c.email,
      'Ana Prueba',
      'sale',
      'Vendimos',
      'http://localhost:4200/c/garment/1',
      undefined,
      undefined,
    );
    const list = await w.notifications.byUser(c.id);
    expect(list.map((n) => n.text)).toHaveLength(2);
    expect(await w.notifications.unreadCountFor(c.id)).toEqual({ count: 2 });
    const read = await w.notifications.markRead(list[0].id, c.id);
    expect(read.read).toBe(true);
    await expect(w.notifications.markRead(list[0].id, 'otro')).rejects.toThrow(
      NotFoundException,
    );
    expect(await w.notifications.markAllRead(c.id)).toEqual({ updated: 1 });
    expect(await w.notifications.unreadCountFor(c.id)).toEqual({ count: 0 });
  });

  it('usa APP_URL, ignora usuarios inexistentes y no se frena si falla el correo', async () => {
    const db = new FakeDb();
    const model = db.model<Notification>(Notification.name, NotificationSchema);
    const mail = mailMock();
    const users = {
      findById: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ email: 'a@a', name: 'A' }),
    };
    const service = new NotificationsService(
      model as never,
      users as unknown as UsersService,
      mail as unknown as MailService,
      config({ APP_URL: 'https://trama.app/' }),
    );
    await service.emit({ userId: 'u1', type: 'sale', text: 't', target: '/c' });
    await flush();
    expect(mail.sendLifecycleNotification).not.toHaveBeenCalled();
    mail.sendLifecycleNotification.mockRejectedValueOnce(new Error('caído'));
    await service.emit({ userId: 'u1', type: 'sale', text: 't', target: '/c' });
    await flush();
    expect((mail.sendLifecycleNotification.mock.calls[0] as unknown[])[4]).toBe(
      'https://trama.app/c',
    );
    expect(model.docs()).toHaveLength(2);
  });
});
