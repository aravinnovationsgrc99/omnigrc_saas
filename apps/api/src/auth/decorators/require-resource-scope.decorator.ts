import { SetMetadata } from '@nestjs/common';
import { ResourceScopeType } from '@omnigrc/shared';

export const RESOURCE_SCOPE_KEY = 'resource_scope_metadata';

export interface ResourceScopeMetadataOptions {
  action: 'READ' | 'WRITE' | 'ADMIN';
  scopeType?: ResourceScopeType | 'ORGANIZATION' | 'DEPARTMENT' | 'PROJECT';
  isSettingsMutation?: boolean;
}

export const RequireResourceScope = (options: ResourceScopeMetadataOptions) =>
  SetMetadata(RESOURCE_SCOPE_KEY, options);
