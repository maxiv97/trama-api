import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GarmentsModule } from '../garments/garments.module';
import { SalesPointsModule } from '../sales-points/sales-points.module';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';
import { GarmentReturn, GarmentReturnSchema } from './schemas/return.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GarmentReturn.name, schema: GarmentReturnSchema },
    ]),
    GarmentsModule,
    SalesPointsModule,
  ],
  controllers: [ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
