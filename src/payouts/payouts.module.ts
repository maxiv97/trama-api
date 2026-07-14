import { Module } from '@nestjs/common';
import { GarmentsModule } from '../garments/garments.module';
import { SalesModule } from '../sales/sales.module';
import { UsersModule } from '../users/users.module';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';

@Module({
  imports: [GarmentsModule, SalesModule, UsersModule],
  controllers: [PayoutsController],
  providers: [PayoutsService],
})
export class PayoutsModule {}
