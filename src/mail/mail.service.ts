import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

// Sends transactional email. When SMTP credentials are configured it uses nodemailer; otherwise it
// falls back to logging the message, so local development and the demo work without credentials.
// Nodemailer sits behind this one service so swapping the transport (another SMTP, a provider's API)
// never touches the verification flow.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: nodemailer.Transporter;
  private readonly from: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const user = this.config.get<string>('MAIL_USER');
    const pass = this.config.get<string>('MAIL_PASS');
    this.enabled = !!(user && pass);
    this.from = this.config.get<string>('MAIL_FROM') || (user ? `Trama <${user}>` : 'Trama');

    if (this.enabled) {
      this.transporter = nodemailer.createTransport({
        host: this.config.get<string>('MAIL_HOST', 'smtp.gmail.com'),
        port: this.config.get<number>('MAIL_PORT', 465),
        secure: this.config.get<number>('MAIL_PORT', 465) === 465,
        auth: { user, pass },
      });
    } else {
      this.logger.warn('MAIL_USER/MAIL_PASS no configurados: los emails se loguean en vez de enviarse');
    }
  }

  async sendVerificationCode(to: string, name: string, code: string): Promise<void> {
    const subject = 'Tu código de verificación de Trama';
    const text = `Hola ${name},\n\nTu código de verificación es ${code}. Vence en 10 minutos.\n\nSi no creaste una cuenta en Trama, podés ignorar este mensaje.`;
    const html = `<p>Hola ${name},</p><p>Tu código de verificación es <strong style="font-size:20px;letter-spacing:3px">${code}</strong>.</p><p>Vence en 10 minutos.</p><p style="color:#6b7280;font-size:13px">Si no creaste una cuenta en Trama, podés ignorar este mensaje.</p>`;

    if (!this.enabled || !this.transporter) {
      this.logger.log(`[MOCK MAIL] Código de verificación para ${to}: ${code}`);
      return;
    }
    await this.transporter.sendMail({ from: this.from, to, subject, text, html });
  }
}
