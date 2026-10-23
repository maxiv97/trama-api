import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MailService } from '../mail/mail.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import {
  SupportCounter,
  SupportTicket,
  SupportTicketDocument,
} from './schemas/support-ticket.schema';
import {
  MAX_CAPTURE_BYTES,
  MAX_TICKETS_PER_WINDOW,
  TICKET_WINDOW_MS,
} from './support.constants';

export interface CreatedTicket {
  ticketId: string;
}

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    @InjectModel(SupportTicket.name)
    private readonly tickets: Model<SupportTicketDocument>,
    @InjectModel(SupportCounter.name)
    private readonly counters: Model<SupportCounter>,
    private readonly mail: MailService,
  ) {}

  async create(dto: CreateTicketDto, userId?: string): Promise<CreatedTicket> {
    // Honeypot: se responde como si todo hubiera ido bien, pero no se guarda ni se envía nada.
    if (dto.website?.trim()) {
      this.logger.warn(`Ticket descartado por honeypot (${dto.email})`);
      return { ticketId: this.format(new Date().getFullYear(), 0) };
    }

    const email = dto.email.toLowerCase();
    const since = new Date(Date.now() - TICKET_WINDOW_MS);
    const recent = await this.tickets
      .countDocuments({ email, createdAt: { $gte: since } })
      .exec();
    if (recent >= MAX_TICKETS_PER_WINDOW) {
      throw new HttpException(
        'Recibimos varias consultas desde este email. Probá de nuevo en una hora.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const capture = dto.captura ? this.parseCapture(dto.captura) : undefined;
    const ticketId = await this.nextId();
    await this.tickets.create({
      ticketId,
      motivo: dto.motivo,
      rol: dto.rol,
      nombre: dto.nombre,
      email,
      mensaje: dto.mensaje,
      origen: dto.origen,
      faqsVistas: dto.faqsVistas ?? [],
      conCaptura: !!capture,
      userId,
    });

    // El ticket ya quedó guardado: los emails salen sin bloquear la respuesta (un proveedor lento o
    // caído no debe hacer fallar el envío del formulario).
    const ticket = { ...dto, email, ticketId, userId };
    this.mail
      .sendSupportTicket(ticket, capture)
      .catch((err: Error) =>
        this.logger.error(
          `No se pudo enviar el ticket ${ticketId} a Trama: ${err.message}`,
        ),
      );
    this.mail
      .sendSupportConfirmation(email, dto.nombre, ticketId, dto.motivo)
      .catch((err: Error) =>
        this.logger.error(
          `No se pudo enviar la confirmación de ${ticketId}: ${err.message}`,
        ),
      );

    return { ticketId };
  }

  private async nextId(): Promise<string> {
    const year = new Date().getFullYear();
    const counter = await this.counters
      .findOneAndUpdate(
        { _id: `ticket-${year}` },
        { $inc: { seq: 1 } },
        { upsert: true, new: true },
      )
      .exec();
    return this.format(year, counter.seq);
  }

  private format(year: number, seq: number): string {
    return `TR-${year}-${String(seq).padStart(6, '0')}`;
  }

  private parseCapture(dataUrl: string): { name: string; content: string } {
    const match = dataUrl.match(
      /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/,
    );
    const ext = match?.[1] === 'jpeg' ? 'jpg' : (match?.[1] ?? 'png');
    const content = match?.[2] ?? '';
    const bytes = Math.floor((content.length * 3) / 4);
    if (bytes > MAX_CAPTURE_BYTES) {
      throw new PayloadTooLargeException('La captura supera los 5 MB');
    }
    return { name: `captura.${ext}`, content };
  }
}
