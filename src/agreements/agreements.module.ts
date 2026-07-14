import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GarmentsModule } from '../garments/garments.module';
import { AgreementsController } from './agreements.controller';
import { AgreementsService } from './agreements.service';
import { Agreement, AgreementSchema } from './schemas/agreement.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Agreement.name, schema: AgreementSchema }]),
    GarmentsModule,
  ],
  controllers: [AgreementsController],
  providers: [AgreementsService],
  exports: [AgreementsService],
})
export class AgreementsModule {}
