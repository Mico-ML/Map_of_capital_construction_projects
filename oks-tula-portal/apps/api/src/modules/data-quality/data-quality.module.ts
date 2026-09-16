import { Module } from '@nestjs/common';
import { DataQualityController } from './data-quality.controller';

@Module({ controllers: [DataQualityController] })
export class DataQualityModule {}
