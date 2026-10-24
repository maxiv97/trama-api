import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { SessionUser } from '../auth/session-user';
import { CreateReturnDto } from './dto/create-return.dto';
import { RegisterDispositionDto } from './dto/register-disposition.dto';
import { ReturnsService } from './returns.service';

@Controller()
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Post('returns')
  @Roles('merchant')
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateReturnDto) {
    return this.returns.create(user, dto);
  }

  @Get('garments/:garmentId/return')
  byGarment(
    @CurrentUser() user: SessionUser,
    @Param('garmentId') garmentId: string,
  ) {
    return this.returns.byGarment(garmentId, user);
  }

  @Post('garments/:garmentId/disposition')
  @Roles('merchant')
  registerDisposition(
    @CurrentUser() user: SessionUser,
    @Param('garmentId') garmentId: string,
    @Body() dto: RegisterDispositionDto,
  ) {
    return this.returns.registerDisposition(garmentId, user, dto);
  }
}
