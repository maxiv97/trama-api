import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @IsString() @MinLength(1) @MaxLength(60) label: string;

  @IsOptional() @IsArray() @IsString({ each: true }) subcategories?: string[];

  // Categoría base a la que consolida para métricas globales (opcional).
  @IsOptional() @IsString() parentLabel?: string;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) label?: string;

  @IsOptional() @IsArray() @IsString({ each: true }) subcategories?: string[];

  @IsOptional() @IsString() parentLabel?: string;
}

export class SetHiddenCategoriesDto {
  @IsArray() @IsString({ each: true }) labels: string[];
}
