import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { SessionUser } from '../auth/session-user';
import { CreateReceptionDto } from './dto/create-reception.dto';
import { ReceptionsService } from './receptions.service';

@Controller()
export class ReceptionsController {
  constructor(private readonly receptions: ReceptionsService) {}

  @Post('receptions')
  @Roles('merchant')
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateReceptionDto) {
    return this.receptions.create(user, dto);
  }

  @Get('garments/:garmentId/reception')
  byGarment(@Param('garmentId') garmentId: string) {
    return this.receptions.byGarment(garmentId);
  }
}
