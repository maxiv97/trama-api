import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GarmentsModule } from '../garments/garments.module';
import { ReceptionsController } from './receptions.controller';
import { ReceptionsService } from './receptions.service';
import { Reception, ReceptionSchema } from './schemas/reception.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Reception.name, schema: ReceptionSchema }]),
    GarmentsModule,
  ],
  controllers: [ReceptionsController],
  providers: [ReceptionsService],
  exports: [ReceptionsService],
})
export class ReceptionsModule {}
