import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Consignor, ConsignorSchema } from './schemas/consignor.schema';
import { Merchant, MerchantSchema } from './schemas/merchant.schema';
import { User, UserSchema } from './schemas/user.schema';
import { UsersService } from './users.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: User.name,
        schema: UserSchema,
        discriminators: [
          { name: Consignor.name, schema: ConsignorSchema, value: 'consignor' },
          { name: Merchant.name, schema: MerchantSchema, value: 'merchant' },
        ],
      },
    ]),
  ],
  providers: [UsersService],
  exports: [UsersService, MongooseModule],
})
export class UsersModule {}
