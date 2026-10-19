import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CategoriesModule } from '../categories/categories.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GarmentsController } from './garments.controller';
import { GarmentsService } from './garments.service';
import { Counter, CounterSchema } from './schemas/counter.schema';
import { Garment, GarmentSchema } from './schemas/garment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Garment.name, schema: GarmentSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
    NotificationsModule,
    CategoriesModule,
  ],
  controllers: [GarmentsController],
  providers: [GarmentsService],
  exports: [GarmentsService, MongooseModule],
})
export class GarmentsModule {}
