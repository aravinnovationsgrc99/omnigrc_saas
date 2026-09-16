import { SetMetadata } from '@nestjs/common';

export const REQUIRES_ACTIVE_LICENSE_KEY = 'requires_active_license';
export const RequiresActiveLicense = () => SetMetadata(REQUIRES_ACTIVE_LICENSE_KEY, true);

export const BYPASS_LICENSE_CHECK_KEY = 'bypass_license_check';
export const BypassLicenseCheck = () => SetMetadata(BYPASS_LICENSE_CHECK_KEY, true);
