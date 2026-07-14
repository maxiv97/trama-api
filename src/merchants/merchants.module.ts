import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { MerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';

@Module({
  imports: [UsersModule],
  controllers: [MerchantsController],
  providers: [MerchantsService],
})
export class MerchantsModule {}
