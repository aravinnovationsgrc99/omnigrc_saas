import { AsyncLocalStorage } from 'async_hooks';

export interface RequestStore {
  actorId?: string;
  actorRole?: string;
  ipAddress?: string;
  correlationId?: string;
}

export const requestLocalStorage = new AsyncLocalStorage<RequestStore>();
