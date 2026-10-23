import { Global, Module } from '@nestjs/common';
import { readAppConfig, type AppConfig } from './app-config';

export const APP_CONFIG = Symbol('APP_CONFIG');

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (): AppConfig => readAppConfig(),
    },
  ],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
