import { Module } from '@nestjs/common';
import { featureByKey } from '@abapro/shared';
import { createUnimplementedController } from '../../common/create-unimplemented-controller';

@Module({
  controllers: [createUnimplementedController(featureByKey('programs'))],
})
export class ProgramsModule {}
