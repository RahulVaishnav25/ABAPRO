import './polyfill-url';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import type { AppConfig } from './config/app-config';
import { APP_CONFIG } from './config/app-config.module';
import { DATABASE } from './db/database.module';
import type { Database } from './db/database';
import { startEmbeddedIdentity } from './identity/server';

export interface RunningApplication {
  app: INestApplication;
  config: AppConfig;
  database: Database;
  close(): Promise<void>;
}

export async function createApplication(): Promise<RunningApplication> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = configureApp(app);
  const database = app.get<Database>(DATABASE);
  const identity = await startEmbeddedIdentity(database, app.get<AppConfig>(APP_CONFIG));
  return {
    app,
    config,
    database,
    close: async () => {
      await identity?.close();
      await app.close();
    },
  };
}
