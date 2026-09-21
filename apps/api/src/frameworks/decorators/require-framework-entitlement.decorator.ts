import { SetMetadata } from '@nestjs/common';

export const REQUIRE_FRAMEWORK_ENTITLEMENT_KEY = 'require_framework_entitlement';

/**
 * Decorator to specify which route parameter or body property contains the framework ID/code to check.
 * Defaults to route param 'idOrCode' or 'frameworkCode'.
 */
export const RequireFrameworkEntitlement = (paramName = 'idOrCode') =>
  SetMetadata(REQUIRE_FRAMEWORK_ENTITLEMENT_KEY, paramName);
