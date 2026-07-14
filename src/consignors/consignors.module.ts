import { Module } from '@nestjs/common';
import { GarmentsModule } from '../garments/garments.module';
import { UsersModule } from '../users/users.module';
import { ConsignorsController } from './consignors.controller';
import { ConsignorsService } from './consignors.service';

@Module({
  imports: [UsersModule, GarmentsModule],
  controllers: [ConsignorsController],
  providers: [ConsignorsService],
})
export class ConsignorsModule {}
