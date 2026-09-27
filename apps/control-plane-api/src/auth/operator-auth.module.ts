import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { OperatorAuthService } from './operator-auth.service';
import { OperatorSecurityService } from './operator-security.service';
import { OperatorJwtStrategy } from './operator-jwt.strategy';
import { OperatorJwtGuard } from './operator-jwt.guard';
import { OperatorRbacGuard } from './operator-rbac.guard';
import { ControlPlaneAdminGuard } from './control-plane-admin.guard';
import { OperatorAuthController } from './operator-auth.controller';
import { ControlPlanePrismaModule } from '../prisma/prisma.module';
import { ControlPlaneAuditLogsModule } from '../audit/audit-logs.module';

@Module({
  imports: [
    ControlPlanePrismaModule,
    ControlPlaneAuditLogsModule,
    PassportModule.register({ defaultStrategy: 'operator-jwt' }),
    JwtModule.register({
      secret: process.env.OPERATOR_JWT_SECRET || process.env.JWT_SECRET || 'arav-operator-dev-jwt-secret-key-2026',
      signOptions: {
        expiresIn: '15m',
        issuer: 'OMNiGRC Control Plane',
        audience: 'omnigrc-operator-api',
        algorithm: 'HS256',
      },
    }),
  ],
  providers: [
    OperatorAuthService,
    OperatorSecurityService,
    OperatorJwtStrategy,
    OperatorJwtGuard,
    OperatorRbacGuard,
    ControlPlaneAdminGuard,
  ],
  controllers: [OperatorAuthController],
  exports: [
    OperatorAuthService,
    OperatorSecurityService,
    OperatorJwtGuard,
    OperatorRbacGuard,
    ControlPlaneAdminGuard,
    JwtModule,
    PassportModule,
  ],
})
export class OperatorAuthModule {}
