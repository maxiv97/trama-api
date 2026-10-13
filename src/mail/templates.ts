import type { NotificationType } from '../shared/domain/enums';

// Shared branded shell: dark header with the Trama wordmark, a white card body, and a footer.
// Table-based with inline styles so it renders consistently across mail clients (Gmail/Outlook/mobile).
function shell(innerHtml: string): string {
  return `<div style="margin:0;padding:0;background:#edf2e5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#edf2e5;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e3e9da;">
        <tr><td style="background:#19281d;padding:22px 28px;">
          <span style="font-size:20px;font-weight:bold;color:#ffffff;letter-spacing:-0.02em;">Trama</span>
        </td></tr>
        ${innerHtml}
      </table>
      <p style="max-width:480px;margin:16px auto 0;font-size:11px;color:#9ca398;text-align:center;">Trama · Ropa en consignación, con las cuentas claras</p>
    </td></tr>
  </table>
</div>`;
}

function footerRow(): string {
  return `<tr><td style="padding:22px 28px 0;"><div style="border-top:1px solid #e6ece0;font-size:0;line-height:0;">&nbsp;</div></td></tr>
        <tr><td style="padding:14px 28px 26px;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca398;">Este es un aviso automático de Trama. No respondas a este correo.</p>
        </td></tr>`;
}

export function buildVerificationEmail(name: string, code: string): { html: string; text: string } {
  const inner = `<tr><td style="padding:30px 28px 8px;">
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
        </td></tr>`;
  const text = `Hola ${name},\n\nUsá este código para verificar tu cuenta en Trama: ${code}\nVence en 10 minutos.\n\nSi no creaste una cuenta en Trama, podés ignorar este mensaje.`;
  return { html: shell(inner), text };
}

export interface EmailDetail {
  label: string;
  value: string;
}

// A small sand-coloured box listing label/value rows; only rendered when there are details.
function detailsBlock(details: EmailDetail[]): string {
  if (!details.length) return '';
  const rows = details
    .map(
      (d) =>
        `<tr><td style="padding:6px 0;font-size:13px;color:#868d83;">${d.label}</td><td style="padding:6px 0;font-size:14px;color:#1c2620;font-weight:bold;text-align:right;">${d.value}</td></tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f6ec;border:1px solid #e3e9da;border-radius:12px;margin:0 0 22px;">
            <tr><td style="padding:6px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
          </table>`;
}

// Lifecycle notification email: a headline, the event message, an optional details box, and a button.
export function buildNotificationEmail(
  name: string,
  headline: string,
  message: string,
  ctaUrl: string,
  details: EmailDetail[] = [],
): { html: string; text: string } {
  const inner = `<tr><td style="padding:30px 28px 8px;">
          <p style="margin:0 0 6px;font-size:16px;color:#1c2620;">Hola ${name},</p>
          <p style="margin:0 0 6px;font-size:18px;font-weight:bold;color:#19281d;">${headline}</p>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.5;color:#565e55;">${message}</p>
          ${detailsBlock(details)}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
            <a href="${ctaUrl}" style="display:inline-block;background:#2e7d54;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;border-radius:10px;padding:13px 26px;">Ver en Trama</a>
          </td></tr></table>
        </td></tr>
        ${footerRow()}`;
  const detailsText = details.length
    ? '\n' + details.map((d) => `${d.label}: ${d.value}`).join('\n') + '\n'
    : '';
  const text = `Hola ${name},\n\n${headline}\n${message}\n${detailsText}\nVer en Trama: ${ctaUrl}`;
  return { html: shell(inner), text };
}

const SUBJECTS: Record<NotificationType, string> = {
  proposal: 'Novedades de una propuesta en Trama',
  counteroffer: 'Te hicieron una contraoferta en Trama',
  agreement: 'Acuerdo confirmado en Trama',
  reception: 'Novedades de la recepción de tu prenda',
  sale: '¡Vendiste una prenda en Trama!',
  payout: 'Tu liquidación en Trama',
};

const HEADLINES: Record<NotificationType, string> = {
  proposal: 'Tenés una novedad',
  counteroffer: 'Te hicieron una contraoferta',
  agreement: '¡Trato cerrado!',
  reception: 'Novedades de la recepción',
  sale: '¡Se vendió tu prenda!',
  payout: 'Liquidación realizada',
};

export function subjectForNotification(type: NotificationType): string {
  return SUBJECTS[type] ?? 'Novedades en Trama';
}

export function headlineForNotification(type: NotificationType): string {
  return HEADLINES[type] ?? 'Novedades en Trama';
}
