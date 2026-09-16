import { Module } from '@nestjs/common';
import { MunicipalitiesController } from './municipalities.controller';

@Module({ controllers: [MunicipalitiesController] })
export class MunicipalitiesModule {}
