import { Module } from '@nestjs/common';
import { APP_FEATURES } from '@abapro/shared';
import { createUnimplementedController } from '../common/create-unimplemented-controller';

/** Answers each feature that is not built yet with a "not implemented" status. */
@Module({
  controllers: APP_FEATURES.filter((feature) => !feature.implemented).map((feature) => createUnimplementedController(feature)),
})
export class UnimplementedFeaturesModule {}
