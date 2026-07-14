import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString, ValidateNested } from 'class-validator';

class GeoDto {
  @IsNumber() lat: number;
  @IsNumber() lng: number;
}

class ReceptionScheduleDto {
  @IsString() days: string;
  @IsString() hours: string;
  @IsString() instructions: string;
}

export class SalesPointDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() address: string;
  @IsString() phone: string;
  @ValidateNested() @Type(() => GeoDto) geo: GeoDto;
  @ValidateNested() @Type(() => ReceptionScheduleDto) receptionSchedule: ReceptionScheduleDto;
}
