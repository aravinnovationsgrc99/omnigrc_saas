import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { TenantContext } from './tenant.context';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly jwtService: JwtService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    let organizationId: string | undefined;
    let userId: string | undefined;
    let role: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        // Phase 10 Security: Use verify() instead of decode() to cryptographically validate
        // the JWT signature and expiry before trusting any claims for tenant scoping.
        // Using decode() without verification would allow forged/expired tokens to set the
        // tenant context, bypassing Prisma tenant isolation middleware.
        const payload = this.jwtService.verify(token, {
          secret: process.env.JWT_SECRET || 'omnigrc-dev-secret-key-change-in-prod',
        }) as any;
        if (payload && typeof payload === 'object') {
          organizationId = payload.organizationId;
          userId = payload.sub;
          role = payload.role;
        }
      } catch {
        // Verification failure (expired, forged, wrong secret) → context is NOT set.
        // JwtAuthGuard on protected routes will return 401 Unauthorized as expected.
        organizationId = undefined;
        userId = undefined;
        role = undefined;
      }
    }

    TenantContext.run({ organizationId, userId, role }, () => {
      next();
    });
  }
}
