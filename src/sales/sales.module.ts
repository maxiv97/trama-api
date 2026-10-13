import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AgreementsModule } from '../agreements/agreements.module';
import { GarmentsModule } from '../garments/garments.module';
import { UsersModule } from '../users/users.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { Sale, SaleSchema } from './schemas/sale.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Sale.name, schema: SaleSchema }]),
    GarmentsModule,
    AgreementsModule,
    UsersModule,
  ],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
