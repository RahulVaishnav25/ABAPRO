import 'vue-router';
import type { Permission } from '@abapro/shared';

declare module 'vue-router' {
  interface RouteMeta {
    title?: string;
    public?: boolean;
    permission?: Permission;
    anyPermission?: Permission[];
    breadcrumb?: string;
    featureKey?: string;
    platformAdmin?: boolean;
  }
}

export {};
