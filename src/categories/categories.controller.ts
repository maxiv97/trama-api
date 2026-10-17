import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { SessionUser } from '../auth/session-user';
import { CategoriesService } from './categories.service';
import {
  CreateCategoryDto,
  SetHiddenCategoriesDto,
  UpdateCategoryDto,
} from './dto/category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  // Base + custom del comercio. El wizard del cedente lo llama con el comercio
  // elegido; el comercio lo llama con su propio id para el ABM.
  @Get()
  list(@Query('merchantId') merchantId?: string) {
    return this.categories.forMerchant(merchantId);
  }

  @Post()
  @Roles('merchant')
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateCategoryDto) {
    return this.categories.create(user.id, dto);
  }

  @Patch('hidden')
  @Roles('merchant')
  setHidden(@CurrentUser() user: SessionUser, @Body() dto: SetHiddenCategoriesDto) {
    return this.categories.setHidden(user.id, dto.labels);
  }

  @Patch(':id')
  @Roles('merchant')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categories.update(user.id, id, dto);
  }

  @Delete(':id')
  @Roles('merchant')
  remove(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.categories.remove(user.id, id);
  }
}
