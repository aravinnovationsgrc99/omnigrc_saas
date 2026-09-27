import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ControlPlanePrismaService } from '../prisma/prisma.service';

export interface OperatorJwtPayload {
  sub: string;
  email: string;
  role: string;
  sessionId: string;
  type: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class OperatorJwtStrategy extends PassportStrategy(Strategy, 'operator-jwt') {
  constructor(private readonly prisma: ControlPlanePrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req) => req?.headers?.['x-operator-access-token'] as string,
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.OPERATOR_JWT_SECRET || process.env.JWT_SECRET || 'arav-operator-dev-jwt-secret-key-2026',
      issuer: 'OMNiGRC Control Plane',
      audience: 'omnigrc-operator-api',
      algorithms: ['HS256'],
    });
  }

  async validate(payload: OperatorJwtPayload) {
    if (payload.type !== 'OPERATOR_ACCESS') {
      throw new UnauthorizedException('Invalid token type for operator authentication');
    }

    const operator = await this.prisma.operator.findUnique({
      where: { id: payload.sub },
    });

    if (!operator) {
      throw new UnauthorizedException('Operator account no longer exists');
    }

    if (operator.status === 'SUSPENDED') {
      throw new ForbiddenException('Operator account is currently suspended');
    }

    // Verify session is active and not revoked
    const session = await this.prisma.operatorSession.findUnique({
      where: { id: payload.sessionId },
    });

    if (!session || session.isRevoked || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Operator session has expired or been revoked');
    }

    return {
      id: operator.id,
      email: operator.email,
      fullName: operator.fullName,
      role: operator.role,
      status: operator.status,
      sessionId: session.id,
      familyId: session.familyId,
      sessionIp: session.ipAddress,
    };
  }
}
