import { Module } from '@nestjs/common';
import { AgreementsModule } from '../agreements/agreements.module';
import { GarmentsModule } from '../garments/garments.module';
import { UsersModule } from '../users/users.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [GarmentsModule, AgreementsModule, UsersModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
