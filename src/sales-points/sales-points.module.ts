import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { SalesPointsController } from './sales-points.controller';
import { SalesPointsService } from './sales-points.service';

@Module({
  imports: [UsersModule],
  controllers: [SalesPointsController],
  providers: [SalesPointsService],
})
export class SalesPointsModule {}
