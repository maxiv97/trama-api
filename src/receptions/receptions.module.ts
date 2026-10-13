import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AgreementsModule } from '../agreements/agreements.module';
import { GarmentsModule } from '../garments/garments.module';
import { SalesPointsModule } from '../sales-points/sales-points.module';
import { ReceptionsController } from './receptions.controller';
import { ReceptionsService } from './receptions.service';
import { Reception, ReceptionSchema } from './schemas/reception.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Reception.name, schema: ReceptionSchema }]),
    GarmentsModule,
    AgreementsModule,
    SalesPointsModule,
  ],
  controllers: [ReceptionsController],
  providers: [ReceptionsService],
  exports: [ReceptionsService],
})
export class ReceptionsModule {}
