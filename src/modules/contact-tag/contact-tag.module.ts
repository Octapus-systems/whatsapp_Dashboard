import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tag } from './entities/tag.entity';
import { ContactTag } from './entities/contact-tag.entity';
import { TagService } from './tag.service';
import { ContactTagService } from './contact-tag.service';
import { TagController } from './tag.controller';
import { ContactTagController } from './contact-tag.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Tag, ContactTag], 'data')],
  controllers: [TagController, ContactTagController],
  providers: [TagService, ContactTagService],
  exports: [TagService, ContactTagService],
})
export class ContactTagModule {}
