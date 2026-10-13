import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

// Branded verification email. Table-based layout with inline styles so it renders consistently across
// mail clients (Gmail/Outlook/mobile); the plain-text version is the fallback for clients without HTML.
function buildVerificationEmail(name: string, code: string): { html: string; text: string } {
  const html = `<div style="margin:0;padding:0;background:#edf2e5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#edf2e5;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e3e9da;">
        <tr><td style="background:#19281d;padding:22px 28px;">
          <span style="font-size:20px;font-weight:bold;color:#ffffff;letter-spacing:-0.02em;">Trama</span>
        </td></tr>
        <tr><td style="padding:30px 28px 8px;">
          <p style="margin:0 0 6px;font-size:16px;color:#1c2620;">Hola ${name},</p>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.5;color:#565e55;">Usá este código para verificar tu cuenta en Trama:</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
            <div style="display:inline-block;background:#f2f6ec;border:1px solid #2e7d54;border-radius:12px;padding:16px 26px;font-size:30px;font-weight:bold;letter-spacing:10px;color:#19281d;">${code}</div>
          </td></tr></table>
          <p style="margin:18px 0 0;font-size:13px;color:#868d83;text-align:center;">Vence en 10 minutos.</p>
        </td></tr>
        <tr><td style="padding:22px 28px 0;"><div style="border-top:1px solid #e6ece0;font-size:0;line-height:0;">&nbsp;</div></td></tr>
        <tr><td style="padding:14px 28px 26px;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca398;">Si no creaste una cuenta en Trama, podés ignorar este mensaje.</p>
        </td></tr>
      </table>
      <p style="max-width:480px;margin:16px auto 0;font-size:11px;color:#9ca398;text-align:center;">Trama · Ropa en consignación, con las cuentas claras</p>
    </td></tr>
  </table>
</div>`;
  const text = `Hola ${name},\n\nUsá este código para verificar tu cuenta en Trama: ${code}\nVence en 10 minutos.\n\nSi no creaste una cuenta en Trama, podés ignorar este mensaje.`;
  return { html, text };
}

// Sends transactional email through Brevo's HTTP API (over HTTPS, so it works on hosts that block
// outbound SMTP, e.g. Railway). Brevo allows a single verified sender address — no domain required —
// so it can email arbitrary recipients from the project's Gmail. When no API key is configured it
// falls back to logging the message, so local development and the demo work without credentials.
// Brevo sits behind this one service so swapping the provider later never touches the verification flow.
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
    const subject = 'Tu código de verificación de Trama';
    const { html: htmlContent, text: textContent } = buildVerificationEmail(name, code);

    if (!this.apiKey) {
      this.logger.log(`[MOCK MAIL] Código de verificación para ${to}: ${code}`);
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
    this.logger.log(`Código de verificación enviado a ${to}`);
  }
}
