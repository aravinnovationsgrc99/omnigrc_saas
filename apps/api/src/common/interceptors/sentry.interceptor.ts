import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { RequestWithId } from '../middleware/request-context.middleware';

@Injectable()
export class SentryInterceptor implements NestInterceptor {
  private readonly logger = new Logger('SentryInterceptor');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((error) => {
        const req = context.switchToHttp().getRequest<RequestWithId>();
        const requestId = req?.requestId || 'N/A';
        const dsn = process.env.SENTRY_DSN;

        if (dsn) {
          this.logger.error(
            `[SENTRY-CAPTURED] Request ${requestId} failed on ${req.method} ${req.originalUrl}: ${error.message}`,
            error.stack,
          );
        } else {
          this.logger.warn(
            `[SENTRY-DISABLED] Request ${requestId} threw exception (SENTRY_DSN not set): ${error.message}`,
          );
        }

        return throwError(() => error);
      }),
    );
  }
}
