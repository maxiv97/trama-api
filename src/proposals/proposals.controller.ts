import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { SessionUser } from '../auth/session-user';
import { CounterofferDto } from './dto/counteroffer.dto';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { ProposalsService } from './proposals.service';

@Controller()
export class ProposalsController {
  constructor(private readonly proposals: ProposalsService) {}

  @Post('proposals')
  @Roles('consignor')
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateProposalDto) {
    return this.proposals.create(user.id, dto);
  }

  @Get('garments/:garmentId/proposal')
  byGarment(@Param('garmentId') garmentId: string) {
    return this.proposals.byGarment(garmentId);
  }

  @Get('proposals')
  @Roles('merchant')
  pending(@CurrentUser() user: SessionUser) {
    return this.proposals.pendingForMerchant(user.id);
  }

  @Get('proposals/:id')
  getById(@Param('id') id: string) {
    return this.proposals.getByIdOrFail(id);
  }

  @Post('proposals/:garmentId/accept')
  @Roles('merchant')
  accept(@CurrentUser() user: SessionUser, @Param('garmentId') garmentId: string) {
    return this.proposals.accept(garmentId, user.id);
  }

  @Post('proposals/:garmentId/counteroffer')
  @Roles('merchant')
  counteroffer(
    @CurrentUser() user: SessionUser,
    @Param('garmentId') garmentId: string,
    @Body() dto: CounterofferDto,
  ) {
    return this.proposals.counteroffer(garmentId, user.id, dto.consignorPrice);
  }

  @Post('proposals/:garmentId/accept-counteroffer')
  @Roles('consignor')
  acceptCounteroffer(@CurrentUser() user: SessionUser, @Param('garmentId') garmentId: string) {
    return this.proposals.acceptCounteroffer(garmentId, user.id);
  }

  @Post('proposals/:garmentId/reject')
  reject(@CurrentUser() user: SessionUser, @Param('garmentId') garmentId: string) {
    return this.proposals.reject(garmentId, user.role);
  }
}
