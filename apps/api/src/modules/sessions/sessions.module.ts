import { Module } from '@nestjs/common';
import { AccessModule } from '../../access/access.module';
import { SessionCollectionService } from '../../clinical/session.service';
import { SessionsController } from '../../clinical/sessions.controller';

@Module({
  imports: [AccessModule],
  controllers: [SessionsController],
  providers: [SessionCollectionService],
})
export class SessionsModule {}
