import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { SessionUser } from '../auth/session-user';
import { AgreementsService } from './agreements.service';

@Controller()
export class AgreementsController {
  constructor(private readonly agreements: AgreementsService) {}

  @Get('garments/:garmentId/agreement')
  byGarment(@Param('garmentId') garmentId: string) {
    return this.agreements.byGarment(garmentId);
  }

  @Get('agreements')
  list(@CurrentUser() user: SessionUser) {
    return this.agreements.listForUser(user.role, user.id);
  }
}
