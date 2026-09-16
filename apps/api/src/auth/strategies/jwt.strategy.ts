import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '@omnigrc/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'omnigrc-dev-secret-key-change-in-prod',
    });
  }

  async validate(payload: JwtPayload) {
    const homeOrgId = payload.actingViaMsspId || payload.organizationId;
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, organizationId: homeOrgId },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    let effectiveOrgId = user.organizationId;
    let actingViaMsspId: string | undefined = undefined;

    // Strict validation for context tokens
    if (payload.actingViaMsspId) {
      // 1. Verify user's home org in DB matches actingViaMsspId claim
      if (user.organizationId !== payload.actingViaMsspId) {
        throw new UnauthorizedException('User home organization mismatch in context token');
      }

      // 2. Verify target organization exists in DB and has parentOrganizationId === user.organizationId
      const targetOrg = await this.prisma.organization.findUnique({
        where: { id: payload.organizationId },
        select: { id: true, parentOrganizationId: true },
      });

      if (!targetOrg || targetOrg.parentOrganizationId !== user.organizationId) {
        throw new UnauthorizedException('Invalid context token or organization relationship revoked');
      }

      effectiveOrgId = targetOrg.id;
      actingViaMsspId = payload.actingViaMsspId;
    }

    return {
      id: user.id,
      userId: user.id,
      email: user.email,
      organizationId: effectiveOrgId,
      actingViaMsspId,
      role: user.role,
      name: user.name,
    };
  }
}
