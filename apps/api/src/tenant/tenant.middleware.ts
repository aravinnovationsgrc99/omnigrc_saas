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
        const payload = this.jwtService.decode(token) as any;
        if (payload && typeof payload === 'object') {
          organizationId = payload.organizationId;
          userId = payload.sub;
          role = payload.role;
        }
      } catch {
        // Token decode failure handled by JwtAuthGuard if route protected
      }
    }

    TenantContext.run({ organizationId, userId, role }, () => {
      next();
    });
  }
}
