import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NotificationType } from '../shared/domain/enums';
import {
  buildNotificationEmail,
  buildVerificationEmail,
  headlineForNotification,
  subjectForNotification,
} from './templates';

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const SEND_TIMEOUT_MS = 10000;

interface Sender {
  name: string;
  email: string;
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

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('BREVO_API_KEY') || undefined;
    this.sender = parseSender(
      this.config.get<string>('MAIL_FROM') || 'Trama <trama.moda.circular@gmail.com>',
    );
    if (!this.apiKey) {
      this.logger.warn('BREVO_API_KEY no configurada: los emails se loguean en vez de enviarse');
    }
  }

  async sendVerificationCode(to: string, name: string, code: string): Promise<void> {
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
  ): Promise<void> {
    const { html, text } = buildNotificationEmail(
      name,
      headlineForNotification(type),
      message,
      ctaUrl,
    );
    await this.send(to, name, subjectForNotification(type), html, text);
  }

  private async send(
    to: string,
    name: string,
    subject: string,
    htmlContent: string,
    textContent: string,
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
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Brevo respondió ${response.status}: ${detail.slice(0, 200)}`);
    }
    this.logger.log(`Email "${subject}" enviado a ${to}`);
  }
}
