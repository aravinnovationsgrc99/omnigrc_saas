import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { lastValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from './tenant.context';

@Injectable()
export class TenantTransactionInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const orgId = TenantContext.getOrganizationId();
    const isSystem = TenantContext.isSystemContext();

    // If unauthenticated, public endpoint, or system execution, do not establish tenant transaction
    if (!orgId || isSystem) {
      return next.handle();
    }

    // Wrap the request handler in an interactive tenant transaction with RLS context
    return from(
      this.prisma.withTenantTransaction(async () => {
        return await lastValueFrom(next.handle());
      })
    );
  }
}
