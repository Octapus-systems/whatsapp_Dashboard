import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, Matches, MaxLength, MinLength } from 'class-validator';

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export class CreateTagDto {
  @ApiProperty({ description: 'Tag name', example: 'VIP' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Hex color for the tag', example: '#22c55e' })
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'color must be a hex color, e.g. #22c55e' })
  color?: string;
}

export class UpdateTagDto {
  @ApiPropertyOptional({ description: 'Tag name' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Hex color for the tag' })
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'color must be a hex color, e.g. #22c55e' })
  color?: string;
}

export class TagResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  color: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
