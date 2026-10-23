import { Logger } from '@nestjs/common';
import { createApplication } from './create-application';

async function bootstrap(): Promise<void> {
  const running = await createApplication();
  await running.app.listen(running.config.port, '0.0.0.0');
  Logger.log(`ABAPro API listening on port ${running.config.port}`, 'Bootstrap');
  if (running.config.embeddedOidc) {
    Logger.log(`Development identity provider listening on ${running.config.oidcIssuer}`, 'Bootstrap');
  }
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Failed to start the API.';
  console.error(message);
  process.exit(1);
});
