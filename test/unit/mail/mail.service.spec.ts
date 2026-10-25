import { config } from '../../helpers/world';
import { MailService } from '../../../src/mail/mail.service';
import {
  buildNotificationEmail,
  buildSupportTicketEmail,
  headlineForNotification,
  stepForStatus,
  subjectForNotification,
} from '../../../src/mail/templates';
import type { NotificationType } from '../../../src/shared/domain/enums';

describe('MailService', () => {
  const fetchMock = jest.fn<Promise<unknown>, [string, RequestInit]>();
  const realFetch = global.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = realFetch;
  });

  const body = (call = 0) =>
    JSON.parse(fetchMock.mock.calls[call][1].body as string) as Record<
      string,
      unknown
    >;

  it('sin clave de Brevo solo registra el correo en el log', async () => {
    const mail = new MailService(config());
    await mail.sendVerificationCode('a@a.com', 'Ana', '123456');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('con clave envía por la API de Brevo con el remitente configurado', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const mail = new MailService(
      config({ BREVO_API_KEY: 'k', MAIL_FROM: 'Trama Dev <dev@trama.app>' }),
    );
    await mail.sendVerificationCode('a@a.com', 'Ana', '123456');
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.brevo.com/v3/smtp/email',
    );
    expect(body()).toMatchObject({
      sender: { name: 'Trama Dev', email: 'dev@trama.app' },
      to: [{ email: 'a@a.com', name: 'Ana' }],
    });
    expect(String(body().htmlContent)).toContain('123456');
  });

  it('remitente sin nombre y error de la API', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('unauthorized'),
    });
    const mail = new MailService(
      config({ BREVO_API_KEY: 'k', MAIL_FROM: 'solo@trama.app' }),
    );
    await expect(
      mail.sendVerificationCode('a@a.com', 'Ana', '1'),
    ).rejects.toThrow('Brevo respondió 401: unauthorized');
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.reject(new Error('x')),
    });
    await expect(
      mail.sendVerificationCode('a@a.com', 'Ana', '1'),
    ).rejects.toThrow('Brevo respondió 500: ');
    expect(body().sender).toEqual({ name: 'Trama', email: 'solo@trama.app' });
  });

  it('aviso del ciclo de vida con detalles y seguimiento', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const mail = new MailService(config({ BREVO_API_KEY: 'k' }));
    await mail.sendLifecycleNotification(
      'a@a.com',
      'Ana',
      'sale',
      '¡Vendimos!',
      'http://x/c',
      [{ label: 'Vas a cobrar', value: '$1' }],
      'sold',
    );
    expect(body().subject).toBe(subjectForNotification('sale'));
    expect(String(body().textContent)).toContain('Vas a cobrar: $1');
    await mail.sendLifecycleNotification(
      'a@a.com',
      'Ana',
      'pickup',
      'Retirala',
      'http://x/c',
    );
    expect(String(body(1).textContent)).not.toContain('Estado:');
  });

  it('ticket de soporte a la casilla de Trama con respuesta al remitente y captura', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const mail = new MailService(
      config({ BREVO_API_KEY: 'k', SUPPORT_EMAIL: 'ayuda@trama.app' }),
    );
    const ticket = {
      ticketId: 'TR-1',
      motivo: 'liquidaciones' as const,
      rol: 'cedente' as const,
      nombre: 'Ana',
      email: 'a@a.com',
      mensaje: '<b>Hola</b>',
    };
    await mail.sendSupportTicket(ticket, {
      name: 'captura.png',
      content: 'AAA',
    });
    expect(body()).toMatchObject({
      to: [{ email: 'ayuda@trama.app' }],
      replyTo: { email: 'a@a.com' },
      attachment: [{ name: 'captura.png' }],
    });
    await mail.sendSupportTicket({
      ...ticket,
      origen: '/ayuda',
      faqsVistas: ['a', 'b'],
      userId: 'u1',
    });
    expect(body(1).attachment).toBeUndefined();
    await mail.sendSupportConfirmation('a@a.com', 'Ana', 'TR-1', 'otro');
    expect(body(2)).toMatchObject({
      replyTo: { email: 'ayuda@trama.app' },
      subject: 'Recibimos tu consulta · TR-1',
    });
  });
});

describe('Plantillas de correo', () => {
  it('asunto y título para cada tipo, con valor por defecto', () => {
    const types: NotificationType[] = [
      'proposal',
      'counteroffer',
      'agreement',
      'reception',
      'sale',
      'payout',
      'delivery',
      'expiry',
      'pickup',
    ];
    for (const type of types) {
      expect(subjectForNotification(type)).toBeTruthy();
      expect(headlineForNotification(type)).toBeTruthy();
    }
    expect(subjectForNotification('otro' as NotificationType)).toBe(
      'Novedades en Trama',
    );
    expect(headlineForNotification('otro' as NotificationType)).toBe(
      'Novedades en Trama',
    );
  });

  it('etapa del seguimiento por estado y bloque de seguimiento', () => {
    expect(stepForStatus('agreed')).toBe(2);
    expect(stepForStatus('rejected')).toBeNull();
    const { html, text } = buildNotificationEmail(
      'Ana',
      'T',
      'M',
      'http://x',
      [],
      0,
    );
    expect(html).toContain('Cargada');
    expect(text).toContain('Estado: Cargada');
  });

  it('el ticket escapa el HTML del mensaje', () => {
    const { html, text } = buildSupportTicketEmail({
      ticketId: 'TR-1',
      motivo: 'M',
      rol: 'R',
      nombre: 'A&B',
      email: 'a@a',
      mensaje: '<script>',
      conCaptura: true,
    });
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Incluye una captura');
    expect(text).toContain('Sin sesión');
  });
});
