import { Controller, Get, Param } from '@nestjs/common';
import { AgreementsService } from './agreements.service';

@Controller('garments/:garmentId/agreement')
export class AgreementsController {
  constructor(private readonly agreements: AgreementsService) {}

  @Get()
  byGarment(@Param('garmentId') garmentId: string) {
    return this.agreements.byGarment(garmentId);
  }
}
