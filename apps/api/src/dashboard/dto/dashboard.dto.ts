import { IsArray, IsBoolean, IsNotEmpty, IsNumber, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { WidgetLayoutItem } from '@omnigrc/shared';

export class WidgetLayoutItemDto implements WidgetLayoutItem {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsBoolean()
  visible: boolean;

  @IsNumber()
  position: number;
}

export class UpdateDashboardPreferenceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WidgetLayoutItemDto)
  layout: WidgetLayoutItemDto[];
}
