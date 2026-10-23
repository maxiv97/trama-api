import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { MailModule } from '../mail/mail.module';
import {
  SupportCounter,
  SupportCounterSchema,
  SupportTicket,
  SupportTicketSchema,
} from './schemas/support-ticket.schema';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SupportTicket.name, schema: SupportTicketSchema },
      { name: SupportCounter.name, schema: SupportCounterSchema },
    ]),
    MailModule,
    // Solo para leer el JWT opcional del endpoint público (mismo secreto que AuthModule).
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'dev-secret-change-me'),
      }),
    }),
  ],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
