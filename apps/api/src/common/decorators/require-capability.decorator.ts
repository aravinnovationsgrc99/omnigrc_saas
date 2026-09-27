import { SetMetadata } from '@nestjs/common';

export const REQUIRE_CAPABILITY_KEY = 'require_capability';

export interface CapabilityRequirements {
  capabilityCode: string;
  action?: 'READ' | 'WRITE';
}

export const RequireCapability = (capabilityCode: string, options?: { action?: 'READ' | 'WRITE' }) =>
  SetMetadata(REQUIRE_CAPABILITY_KEY, {
    capabilityCode,
    action: options?.action || 'WRITE',
  } as CapabilityRequirements);
