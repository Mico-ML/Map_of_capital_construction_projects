import { Module } from '@nestjs/common';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { ObjectsModule } from '../objects/objects.module';

@Module({
  imports: [ObjectsModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
