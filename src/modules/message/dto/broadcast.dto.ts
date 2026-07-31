import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsISO8601,
  ValidateNested,
  Min,
  Max,
  ArrayMaxSize,
  ArrayMinSize,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

class BroadcastOptionsDto {
  @ApiPropertyOptional({ description: 'Delay between messages in ms (min: 1000, default: 3000)', default: 3000 })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(60000)
  delayBetweenMessages?: number;

  @ApiPropertyOptional({ description: 'Add random 0-2s to delay', default: true })
  @IsOptional()
  @IsBoolean()
  randomizeDelay?: boolean;

  @ApiPropertyOptional({ description: 'Stop broadcast on first error', default: false })
  @IsOptional()
  @IsBoolean()
  stopOnError?: boolean;
}

export class CreateBroadcastDto {
  @ApiPropertyOptional({ description: 'Custom broadcast ID (auto-generated if not provided)' })
  @IsOptional()
  @IsString()
  broadcastId?: string;

  @ApiProperty({ description: 'Text message content to send to every recipient', maxLength: 4096 })
  @IsString()
  @MaxLength(4096)
  message: string;

  @ApiPropertyOptional({
    description: 'Explicit recipient chat IDs. Omit (or leave empty) and set allContacts=true to target every contact in the session.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  @ValidateIf((o: CreateBroadcastDto) => !o.allContacts)
  @ArrayMinSize(1)
  recipients?: string[];

  @ApiPropertyOptional({ description: 'Send to every contact currently known for the session', default: false })
  @IsOptional()
  @IsBoolean()
  allContacts?: boolean;

  @ApiPropertyOptional({
    description: 'ISO 8601 timestamp to schedule the broadcast for. Omit to send immediately.',
    example: '2026-08-01T09:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: 'Broadcast processing options' })
  @IsOptional()
  @ValidateNested()
  @Type(() => BroadcastOptionsDto)
  options?: BroadcastOptionsDto;
}

export class BroadcastResponseDto {
  @ApiProperty()
  broadcastId: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  totalRecipients: number;

  @ApiPropertyOptional()
  scheduledAt?: string;

  @ApiPropertyOptional()
  estimatedCompletionTime?: string;

  @ApiProperty()
  statusUrl: string;
}
