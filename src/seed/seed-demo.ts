import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SeedService } from './seed.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  await app.get(SeedService).seedDemoMerchant();
  await app.close();
}

void run();
