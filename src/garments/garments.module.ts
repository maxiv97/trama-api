import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GarmentsController } from './garments.controller';
import { GarmentsService } from './garments.service';
import { Garment, GarmentSchema } from './schemas/garment.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Garment.name, schema: GarmentSchema }])],
  controllers: [GarmentsController],
  providers: [GarmentsService],
  exports: [GarmentsService, MongooseModule],
})
export class GarmentsModule {}
