import { HttpException, PayloadTooLargeException } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { SupportService } from './support.service';

// Prueba unitaria con modelos simulados (la e2e con MongoDB está en test/support.e2e-spec.ts).
describe('SupportService', () => {
  const dto: CreateTicketDto = {
    motivo: 'liquidaciones',
    rol: 'cedente',
    nombre: 'Ana Pérez',
    email: 'Ana@Example.com',
    mensaje: 'No veo la liquidación de septiembre del comercio.',
    faqsVistas: ['cuando-cobro'],
  };

  let recent: number;
  let seq: number;
  let created: Record<string, unknown>[];
  let mail: {
    sendSupportTicket: jest.Mock;
    sendSupportConfirmation: jest.Mock;
  };
  let service: SupportService;

  beforeEach(() => {
    recent = 0;
    seq = 41;
    created = [];
    const tickets = {
      countDocuments: jest.fn(() => ({ exec: () => Promise.resolve(recent) })),
      create: jest.fn((doc: Record<string, unknown>) => {
        created.push(doc);
        return Promise.resolve(doc);
      }),
    };
    const counters = {
      findOneAndUpdate: jest.fn(() => ({
        exec: () => Promise.resolve({ seq: ++seq }),
      })),
    };
    mail = {
      sendSupportTicket: jest.fn(() => Promise.resolve()),
      sendSupportConfirmation: jest.fn(() => Promise.resolve()),
    };
    service = new SupportService(
      tickets as never,
      counters as never,
      mail as unknown as MailService,
    );
  });

  it('guarda el ticket, devuelve el número y manda el email a Trama y la confirmación', async () => {
    const year = new Date().getFullYear();
    const res = await service.create(dto, 'user-1');
    expect(res).toEqual({ ticketId: `TR-${year}-000042` });
    expect(created[0]).toMatchObject({
      ticketId: res.ticketId,
      email: 'ana@example.com',
      userId: 'user-1',
      conCaptura: false,
    });
    expect(mail.sendSupportTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: res.ticketId,
        email: 'ana@example.com',
      }),
      undefined,
    );
    expect(mail.sendSupportConfirmation).toHaveBeenCalledWith(
      'ana@example.com',
      'Ana Pérez',
      res.ticketId,
      'liquidaciones',
    );
  });

  it('honeypot: no guarda ni envía', async () => {
    await service.create({ ...dto, website: 'http://spam' });
    expect(created).toHaveLength(0);
    expect(mail.sendSupportTicket).not.toHaveBeenCalled();
  });

  it('corta en 5 tickets por email por hora con 429', async () => {
    recent = 5;
    await expect(service.create(dto)).rejects.toBeInstanceOf(HttpException);
    await expect(service.create(dto)).rejects.toMatchObject({ status: 429 });
  });

  it('adjunta la captura', async () => {
    await service.create({
      ...dto,
      motivo: 'problema',
      captura: 'data:image/jpeg;base64,AAAA',
    });
    expect(mail.sendSupportTicket).toHaveBeenCalledWith(expect.anything(), {
      name: 'captura.jpg',
      content: 'AAAA',
    });
    expect(created[0]).toMatchObject({ conCaptura: true });
  });

  it('rechaza capturas de más de 5 MB', async () => {
    const big = 'data:image/png;base64,' + 'A'.repeat(7 * 1024 * 1024);
    await expect(
      service.create({ ...dto, captura: big }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('si falla el email el ticket igual se crea', async () => {
    mail.sendSupportTicket.mockRejectedValueOnce(new Error('Brevo caído'));
    await expect(service.create(dto)).resolves.toHaveProperty('ticketId');
  });
});
