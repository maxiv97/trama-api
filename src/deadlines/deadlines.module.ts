import { Module } from '@nestjs/common';
import { AgreementsModule } from '../agreements/agreements.module';
import { GarmentsModule } from '../garments/garments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SalesPointsModule } from '../sales-points/sales-points.module';
import { UsersModule } from '../users/users.module';
import { DeadlinesService } from './deadlines.service';

@Module({
  imports: [
    AgreementsModule,
    GarmentsModule,
    UsersModule,
    SalesPointsModule,
    NotificationsModule,
  ],
  providers: [DeadlinesService],
  exports: [DeadlinesService],
})
export class DeadlinesModule {}
