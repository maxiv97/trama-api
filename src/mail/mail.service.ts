import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GarmentStatus, NotificationType } from '../shared/domain/enums';
import { MOTIVO_LABELS, ROLE_LABELS } from '../support/support.constants';
import type { SupportMotivo, SupportRole } from '../support/support.constants';
import {
  buildNotificationEmail,
  buildSupportConfirmationEmail,
  buildSupportTicketEmail,
  buildVerificationEmail,
  EmailDetail,
  headlineForNotification,
  stepForStatus,
  subjectForNotification,
} from './templates';

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const SEND_TIMEOUT_MS = 10000;

interface Sender {
  name: string;
  email: string;
}

interface SendOptions {
  replyTo?: Sender;
  attachments?: { name: string; content: string }[];
}

export interface SupportTicketMail {
  ticketId: string;
  motivo: SupportMotivo;
  rol: SupportRole;
  nombre: string;
  email: string;
  mensaje: string;
  origen?: string;
  faqsVistas?: string[];
  userId?: string;
}

// Parses "Trama <mail@dominio>" into a sender; falls back to a bare address with a default name.
function parseSender(from: string): Sender {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    return { name: match[1] || 'Trama', email: match[2] };
  }
  return { name: 'Trama', email: from };
}

// Sends transactional email through Brevo's HTTP API (over HTTPS, so it works on hosts that block
// outbound SMTP, e.g. Railway). Brevo allows a single verified sender address — no domain required —
// so it can email arbitrary recipients from the project's Gmail. When no API key is configured it
// falls back to logging the message, so local development and the demo work without credentials.
// Brevo sits behind this one service so swapping the provider later never touches the callers.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey?: string;
  private readonly sender: Sender;
  // Casilla de Trama que recibe los tickets del centro de ayuda.
  private readonly supportInbox: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('BREVO_API_KEY') || undefined;
    this.sender = parseSender(
      this.config.get<string>('MAIL_FROM') ||
        'Trama <trama.moda.circular@gmail.com>',
    );
    this.supportInbox =
      this.config.get<string>('SUPPORT_EMAIL') || this.sender.email;
    if (!this.apiKey) {
      this.logger.warn(
        'BREVO_API_KEY no configurada: los emails se loguean en vez de enviarse',
      );
    }
  }

  async sendVerificationCode(
    to: string,
    name: string,
    code: string,
  ): Promise<void> {
    const { html, text } = buildVerificationEmail(name, code);
    await this.send(to, name, 'Tu código de verificación de Trama', html, text);
  }

  // Emails one lifecycle event (new proposal, agreement, reception, sale, payout, …) to a party,
  // with a button linking to the garment in the app.
  async sendLifecycleNotification(
    to: string,
    name: string,
    type: NotificationType,
    message: string,
    ctaUrl: string,
    details: EmailDetail[] = [],
    garmentStatus?: GarmentStatus,
  ): Promise<void> {
    const { html, text } = buildNotificationEmail(
      name,
      headlineForNotification(type),
      message,
      ctaUrl,
      details,
      garmentStatus ? stepForStatus(garmentStatus) : null,
    );
    await this.send(to, name, subjectForNotification(type), html, text);
  }

  // Ticket de /ayuda/contacto a la casilla de Trama. "Responder" le contesta directo a la persona.
  async sendSupportTicket(
    ticket: SupportTicketMail,
    capture?: { name: string; content: string },
  ): Promise<void> {
    const motivo = MOTIVO_LABELS[ticket.motivo] ?? ticket.motivo;
    const { html, text } = buildSupportTicketEmail({
      ...ticket,
      motivo,
      rol: ROLE_LABELS[ticket.rol] ?? ticket.rol,
      conCaptura: !!capture,
    });
    await this.send(
      this.supportInbox,
      'Trama · Ayuda',
      `[${ticket.ticketId}] ${motivo} · ${ticket.nombre}`,
      html,
      text,
      {
        replyTo: { name: ticket.nombre, email: ticket.email },
        attachments: capture ? [capture] : undefined,
      },
    );
  }

  // Confirmación con el número de consulta para quien escribió.
  async sendSupportConfirmation(
    to: string,
    name: string,
    ticketId: string,
    motivo: SupportMotivo,
  ): Promise<void> {
    const { html, text } = buildSupportConfirmationEmail(
      name,
      ticketId,
      MOTIVO_LABELS[motivo] ?? motivo,
    );
    await this.send(
      to,
      name,
      `Recibimos tu consulta · ${ticketId}`,
      html,
      text,
      {
        replyTo: { name: 'Trama · Ayuda', email: this.supportInbox },
      },
    );
  }

  private async send(
    to: string,
    name: string,
    subject: string,
    htmlContent: string,
    textContent: string,
    options: SendOptions = {},
  ): Promise<void> {
    if (!this.apiKey) {
      this.logger.log(`[MOCK MAIL] "${subject}" → ${to}`);
      return;
    }
    const response = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: this.sender,
        to: [{ email: to, name }],
        subject,
        htmlContent,
        textContent,
        ...(options.replyTo ? { replyTo: options.replyTo } : {}),
        ...(options.attachments?.length
          ? { attachment: options.attachments }
          : {}),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Brevo respondió ${response.status}: ${detail.slice(0, 200)}`,
      );
    }
    this.logger.log(`Email "${subject}" enviado a ${to}`);
  }
}
