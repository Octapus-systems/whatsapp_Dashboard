import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateMessageTemplateDto {
  @ApiProperty({
    description: 'Display name for the template',
    example: 'Greeting',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description: 'Template message content, inserted into the compose box as-is',
    example: 'Hi there! Thanks for reaching out, how can I help you today?',
  })
  @IsString()
  @IsNotEmpty()
  content: string;
}

export class UpdateMessageTemplateDto {
  @ApiPropertyOptional({ description: 'Display name for the template' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Template message content' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  content?: string;
}

export class MessageTemplateResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  content: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
