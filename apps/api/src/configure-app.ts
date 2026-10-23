import { json, type NextFunction, type Request, type Response } from 'express';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppConfig } from './config/app-config';
import { APP_CONFIG } from './config/app-config.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

export function configureApp(app: INestApplication): AppConfig {
  const config = app.get<AppConfig>(APP_CONFIG);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use('/api', json({ limit: '2mb' }));
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
      next();
      return;
    }
    const origin = request.headers.origin;
    if (!origin) {
      next();
      return;
    }
    const allowed = new Set([
      config.webOrigin,
      config.oidcIssuer,
      `http://127.0.0.1:${config.port}`,
      `http://localhost:${config.port}`,
    ]);
    if (!allowed.has(origin)) {
      response.status(403).json({
        statusCode: 403,
        message: 'This request was blocked.',
        path: request.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    next();
  });
  app.enableCors({
    origin: config.corsOrigin,
    credentials: true,
    allowedHeaders: ['Content-Type'],
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  return config;
}
