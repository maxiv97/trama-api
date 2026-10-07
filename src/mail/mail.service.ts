import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 10000;

// Sends transactional email through Resend's HTTP API (over HTTPS, so it works on hosts that block
// outbound SMTP, e.g. Railway). When no API key is configured it falls back to logging the message,
// so local development and the demo work without credentials. Resend sits behind this one service so
// swapping the provider later never touches the verification flow.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey?: string;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('RESEND_API_KEY') || undefined;
    this.from = this.config.get<string>('MAIL_FROM') || 'Trama <onboarding@resend.dev>';
    if (!this.apiKey) {
      this.logger.warn('RESEND_API_KEY no configurada: los emails se loguean en vez de enviarse');
    }
  }

  async sendVerificationCode(to: string, name: string, code: string): Promise<void> {
    const subject = 'Tu código de verificación de Trama';
    const text = `Hola ${name},\n\nTu código de verificación es ${code}. Vence en 10 minutos.\n\nSi no creaste una cuenta en Trama, podés ignorar este mensaje.`;
    const html = `<p>Hola ${name},</p><p>Tu código de verificación es <strong style="font-size:20px;letter-spacing:3px">${code}</strong>.</p><p>Vence en 10 minutos.</p><p style="color:#6b7280;font-size:13px">Si no creaste una cuenta en Trama, podés ignorar este mensaje.</p>`;

    if (!this.apiKey) {
      this.logger.log(`[MOCK MAIL] Código de verificación para ${to}: ${code}`);
      return;
    }

    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: this.from, to, subject, html, text }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Resend respondió ${response.status}: ${detail.slice(0, 200)}`);
    }
    this.logger.log(`Código de verificación enviado a ${to}`);
  }
}
