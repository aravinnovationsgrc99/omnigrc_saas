import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SamlStrategyStub } from './sso/saml.strategy';
import { RolesGuard } from './guards/roles.guard';
import { ResourceAuthorizationService } from './resource-authorization.service';
import { ResourceAuthorizationGuard } from './guards/resource-authorization.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'omnigrc-dev-secret-key-change-in-prod',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, SamlStrategyStub, RolesGuard, ResourceAuthorizationService, ResourceAuthorizationGuard],
  exports: [AuthService, JwtStrategy, RolesGuard, ResourceAuthorizationService, ResourceAuthorizationGuard],
})
export class AuthModule {}
