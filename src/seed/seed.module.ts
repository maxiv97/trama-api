import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Agreement,
  AgreementSchema,
} from '../agreements/schemas/agreement.schema';
import { Garment, GarmentSchema } from '../garments/schemas/garment.schema';
import {
  Notification,
  NotificationSchema,
} from '../notifications/schemas/notification.schema';
import { Proposal, ProposalSchema } from '../proposals/schemas/proposal.schema';
import {
  Reception,
  ReceptionSchema,
} from '../receptions/schemas/reception.schema';
import { Sale, SaleSchema } from '../sales/schemas/sale.schema';
import { UsersModule } from '../users/users.module';
import { SeedService } from './seed.service';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: Garment.name, schema: GarmentSchema },
      { name: Proposal.name, schema: ProposalSchema },
      { name: Agreement.name, schema: AgreementSchema },
      { name: Sale.name, schema: SaleSchema },
      { name: Reception.name, schema: ReceptionSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
