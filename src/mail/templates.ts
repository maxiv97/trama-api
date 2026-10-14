import type { GarmentStatus, NotificationType } from '../shared/domain/enums';

// The seven lifecycle milestones shown in the email tracker, matching the app's ProgressTracker.
const STEPS = ['Cargada', 'En revisión', 'Acordada', 'Recepcionada', 'En stock', 'Vendida', 'Liquidada'];

// Current milestone per garment status. Terminal/negative states (rejected, no_agreement, cancelled)
// map to nothing, so those emails show no tracker.
const STATUS_STEP: Partial<Record<GarmentStatus, number>> = {
  submitted: 0,
  under_review: 1,
  counteroffer: 1,
  agreed: 2,
  in_stock: 4,
  with_remarks: 4,
  sold: 5,
  paid_out: 6,
};

export function stepForStatus(status: GarmentStatus): number | null {
  return STATUS_STEP[status] ?? null;
}

// Vertical timeline: each milestone with its label; done in green, current highlighted, pending grey.
function trackerBlock(current: number): string {
  const GREEN = '#2e7d54';
  const GREY = '#dde4d2';
  const DARK = '#19281d';
  let rows = '';
  for (let i = 0; i < STEPS.length; i++) {
    const done = i < current;
    const cur = i === current;
    const dot = cur
      ? `<div style="width:14px;height:14px;background:${DARK};border:3px solid #c7e3cd;border-radius:50%;font-size:0;line-height:0;">&nbsp;</div>`
      : `<div style="width:${done ? 12 : 10}px;height:${done ? 12 : 10}px;background:${done ? GREEN : GREY};border-radius:50%;font-size:0;line-height:0;">&nbsp;</div>`;
    const label = cur
      ? `<span style="display:inline-block;background:#dceddf;color:${DARK};font-weight:bold;font-size:14px;padding:4px 12px;border-radius:999px;">${STEPS[i]}</span>`
      : `<span style="font-size:14px;color:${done ? '#3c463d' : '#9ca398'};">${STEPS[i]}</span>`;
    rows += `<tr><td width="30" align="center" valign="middle">${dot}</td><td valign="middle" style="padding:3px 0;">${label}</td></tr>`;
    if (i < STEPS.length - 1) {
      rows += `<tr><td width="30" align="center" valign="middle" style="padding:0;"><div style="width:2px;height:12px;margin:0 auto;background:${i < current ? GREEN : GREY};font-size:0;line-height:0;">&nbsp;</div></td><td></td></tr>`;
    }
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;">${rows}</table>`;
}

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

// Lifecycle notification email: a headline, the event message, an optional progress tracker and
// details box, and a button.
export function buildNotificationEmail(
  name: string,
  headline: string,
  message: string,
  ctaUrl: string,
  details: EmailDetail[] = [],
  currentStep: number | null = null,
): { html: string; text: string } {
  const tracker = currentStep === null ? '' : trackerBlock(currentStep);
  const inner = `<tr><td style="padding:30px 28px 8px;">
          <p style="margin:0 0 6px;font-size:16px;color:#1c2620;">Hola ${name},</p>
          <p style="margin:0 0 6px;font-size:18px;font-weight:bold;color:#19281d;">${headline}</p>
          <p style="margin:0 0 ${currentStep === null ? '22' : '10'}px;font-size:15px;line-height:1.5;color:#565e55;">${message}</p>
          ${tracker}
          ${detailsBlock(details)}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
            <a href="${ctaUrl}" style="display:inline-block;background:#2e7d54;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;border-radius:10px;padding:13px 26px;">Ver en Trama</a>
          </td></tr></table>
        </td></tr>
        ${footerRow()}`;
  const stageText = currentStep === null ? '' : `\nEstado: ${STEPS[currentStep]}\n`;
  const detailsText = details.length
    ? '\n' + details.map((d) => `${d.label}: ${d.value}`).join('\n') + '\n'
    : '';
  const text = `Hola ${name},\n\n${headline}\n${message}\n${stageText}${detailsText}\nVer en Trama: ${ctaUrl}`;
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
