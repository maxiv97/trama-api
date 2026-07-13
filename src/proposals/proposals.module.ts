import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AgreementsModule } from '../agreements/agreements.module';
import { GarmentsModule } from '../garments/garments.module';
import { UsersModule } from '../users/users.module';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';
import { Proposal, ProposalSchema } from './schemas/proposal.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Proposal.name, schema: ProposalSchema }]),
    GarmentsModule,
    AgreementsModule,
    UsersModule,
  ],
  controllers: [ProposalsController],
  providers: [ProposalsService],
  exports: [ProposalsService],
})
export class ProposalsModule {}
