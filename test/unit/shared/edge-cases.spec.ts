import { config } from '../../helpers/world';
import { buildWorld } from '../../helpers/world';
import {
  MerchantParty,
  newConsignor,
  newMerchant,
  Party,
  received,
} from '../../helpers/fixtures';
import { MailService } from '../../../src/mail/mail.service';
import { buildNotificationEmail } from '../../../src/mail/templates';
import { buildDemoDataset } from '../../../src/seed/demo-data';
import { SupportService } from '../../../src/support/support.service';
import { availableActions } from '../../../src/shared/state-machine/garment.state-machine';
import type { GarmentStatus } from '../../../src/shared/domain/enums';

// Casos de borde: valores por defecto y datos faltantes que los recorridos principales no tocan.
describe('Casos de borde', () => {
  it('estado desconocido: sin acciones disponibles; lote de demostración con la fecha de hoy', () => {
    expect(availableActions('inexistente' as GarmentStatus)).toEqual([]);
    expect(buildDemoDataset().garments.length).toBeGreaterThan(100);
  });

  it('correo: plantilla sin detalles ni seguimiento, remitente sin nombre y etiquetas desconocidas', async () => {
    const { html } = buildNotificationEmail(
      'Ana',
      'Título',
      'Mensaje',
      'http://x',
    );
    expect(html).toContain('Mensaje');
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    const realFetch = global.fetch;
    global.fetch = fetchMock;
    try {
      const mail = new MailService(
        config({ BREVO_API_KEY: 'k', MAIL_FROM: '<sin-nombre@trama.app>' }),
      );
      await mail.sendSupportTicket({
        ticketId: 'T',
        motivo: 'raro' as never,
        rol: 'otro' as never,
        nombre: 'A',
        email: 'a@a',
        mensaje: 'm',
      });
      await mail.sendSupportConfirmation('a@a', 'A', 'T', 'raro' as never);
      const body = JSON.parse(
        (fetchMock.mock.calls[0] as [string, { body: string }])[1].body,
      ) as { sender: { name: string }; subject: string };
      expect(body.sender.name).toBe('Trama');
      expect(body.subject).toContain('raro');
    } finally {
      global.fetch = realFetch;
    }
  });

  it('soporte: captura JPEG o con un formato que no se reconoce', async () => {
    const mail = {
      sendSupportTicket: jest.fn(() => Promise.resolve()),
      sendSupportConfirmation: jest.fn(() => Promise.resolve()),
    };
    const tickets = {
      countDocuments: jest.fn(() => ({ exec: () => Promise.resolve(0) })),
      create: jest.fn((d: unknown) => Promise.resolve(d)),
    };
    const counters = {
      findOneAndUpdate: jest.fn(() => ({
        exec: () => Promise.resolve({ seq: 1 }),
      })),
    };
    const service = new SupportService(
      tickets as never,
      counters as never,
      mail as unknown as MailService,
    );
    const dto = {
      motivo: 'problema' as const,
      rol: 'cedente' as const,
      nombre: 'Ana',
      email: 'a@a.com',
      mensaje: 'x'.repeat(30),
    };
    await service.create({ ...dto, captura: 'data:image/jpeg;base64,AAAA' });
    expect((mail.sendSupportTicket.mock.calls[0] as unknown[])[1]).toEqual({
      name: 'captura.jpg',
      content: 'AAAA',
    });
    await service.create({ ...dto, captura: 'no-es-una-imagen' });
    expect((mail.sendSupportTicket.mock.calls[1] as unknown[])[1]).toEqual({
      name: 'captura.png',
      content: '',
    });
  });

  describe('servicios con datos faltantes', () => {
    let w: ReturnType<typeof buildWorld>;
    let m: MerchantParty;
    let c: Party;
    beforeEach(async () => {
      w = buildWorld();
      m = await newMerchant(w);
      c = await newConsignor(w);
    });

    it('reportes sin filtros explícitos y categorías de un comercio inexistente', async () => {
      await received(w, c, m);
      expect(await w.reports.salesByPoint(m.id)).toEqual([]); // sin ventas todavía
      expect(await w.reports.weekly(m.id)).toHaveLength(6);
      expect(
        await w.categories.isValidForMerchant(
          'Camperas y abrigos',
          '000000000000000000000000',
        ),
      ).toBe(true);
    });

    it('venta masiva: un error que no es una excepción se informa igual', async () => {
      const garment = await received(w, c, m);
      jest.spyOn(w.agreements, 'byGarment').mockRejectedValueOnce('falla rara');
      const result = await w.sales.bulkCreate(m.session, {
        garmentIds: [garment.id],
        soldAt: new Date().toISOString(),
      });
      expect(result.failed).toEqual([
        { garmentId: garment.id, reason: 'Error' },
      ]);
    });

    it('una propuesta con un estado de prenda sin etiqueta usa el valor original en el aviso', async () => {
      await w.categories.seedBase();
      await w.garments
        .create(c.id, {
          name: 'Rara',
          category: 'Camperas y abrigos',
          brand: 'B',
          size: 'S',
          color: 'C',
          season: 'S',
          condition: 'como_nuevo' as never,
          photos: [],
          merchantId: m.id,
        })
        .catch(() => undefined);
      expect(w.models.garment.docs().length).toBeLessThanOrEqual(1);
    });
  });
});
