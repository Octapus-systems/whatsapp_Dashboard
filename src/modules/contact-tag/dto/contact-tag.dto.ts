import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ArrayUnique } from 'class-validator';

export class SetContactTagsDto {
  @ApiProperty({ description: 'Full list of tag names to assign to this contact', example: ['VIP', 'Lead'] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  tags: string[];

  @ApiPropertyOptional({ description: 'Optional display name snapshot for the contact' })
  @IsOptional()
  @IsString()
  name?: string;
}

export class AddContactTagDto {
  @ApiProperty({ description: 'Tag name to add to the contact', example: 'VIP' })
  @IsString()
  tag: string;

  @ApiPropertyOptional({ description: 'Optional display name snapshot for the contact' })
  @IsOptional()
  @IsString()
  name?: string;
}

export class ContactTagResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  sessionId: string;

  @ApiProperty()
  jid: string;

  @ApiPropertyOptional()
  name?: string | null;

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiPropertyOptional({ description: 'Operator (API key name) currently assigned to this chat, if claimed' })
  assignedTo?: string | null;

  @ApiPropertyOptional({ description: 'Timestamp when the chat was claimed' })
  assignedAt?: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
