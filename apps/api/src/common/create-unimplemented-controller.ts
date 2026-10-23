import { Controller, Get, Type } from '@nestjs/common';
import type { FeatureDefinition, UnimplementedModuleResponse } from '@abapro/shared';
import { RequirePermissions } from './auth.decorators';

export function createUnimplementedController(feature: FeatureDefinition): Type<unknown> {
  if (feature.implemented) {
    throw new Error(`${feature.key} is implemented and needs an explicit controller.`);
  }

  @Controller(`v1/${feature.apiPath}`)
  class FeatureController {
    @Get()
    @RequirePermissions(feature.permission)
    getStatus(): UnimplementedModuleResponse {
      return {
        implemented: false,
        module: feature.key,
        title: feature.title,
        message: `${feature.title} is not implemented yet.`,
      };
    }
  }

  Object.defineProperty(FeatureController, 'name', {
    value: `${feature.key.charAt(0).toUpperCase()}${feature.key.slice(1)}Controller`,
  });

  return FeatureController;
}
