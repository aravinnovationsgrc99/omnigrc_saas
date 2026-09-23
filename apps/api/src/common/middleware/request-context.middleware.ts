import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';

export interface RequestWithId extends Request {
  requestId?: string;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: RequestWithId, res: Response, next: NextFunction) {
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const secret = process.env.JWT_SECRET || 'super-secret-jwt-key';
        const verified = jwt.verify(token, secret) as any;
        (req as any).user = verified;
      } catch {
        // Token invalid, expired, or tampered — req.user remains undefined
      }
    }

    const startTime = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      this.logger.log(
        `[${requestId}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`,
      );
    });

    next();
  }
}
