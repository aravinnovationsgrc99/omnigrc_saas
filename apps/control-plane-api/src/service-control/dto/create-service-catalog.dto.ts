import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateServiceCatalogDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  isCommerciallyControllable?: boolean;

  @IsOptional()
  @IsBoolean()
  isOrgOverridePermitted?: boolean;

  @IsOptional()
  @IsBoolean()
  hasBackgroundProcessing?: boolean;
}
