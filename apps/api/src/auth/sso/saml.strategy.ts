import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-saml';

/**
 * Built in Phase 1 per SOW Section 5.1; activation gated to post-POC paid tiers.
 *
 * This SSO/SAML strategy stub is pre-scaffolded for enterprise single sign-on integration.
 * It remains inactive during Phase 1 POC and contains no registered active routes.
 */
@Injectable()
export class SamlStrategyStub extends PassportStrategy(Strategy, 'saml-stub') {
  constructor() {
    super({
      entryPoint: 'https://stub-idp.omnigrc.local/saml/sso',
      issuer: 'omnigrc-saml-stub',
      callbackUrl: 'http://localhost:3001/auth/saml/callback',
      cert: 'STUB_CERTIFICATE',
    });
  }

  async validate(profile: any): Promise<any> {
    return {
      email: profile?.nameID,
    };
  }
}
