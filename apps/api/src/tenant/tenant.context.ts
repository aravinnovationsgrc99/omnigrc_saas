import { AsyncLocalStorage } from 'async_hooks';

export interface TenantStore {
  organizationId?: string;
  userId?: string;
  role?: string;
}

export class TenantContext {
  private static readonly storage = new AsyncLocalStorage<TenantStore>();

  static run(store: TenantStore, callback: () => void | Promise<void>) {
    return this.storage.run(store, callback);
  }

  static getStore(): TenantStore | undefined {
    return this.storage.getStore();
  }

  static getOrganizationId(): string | undefined {
    return this.getStore()?.organizationId;
  }

  static getUserId(): string | undefined {
    return this.getStore()?.userId;
  }

  static getRole(): string | undefined {
    return this.getStore()?.role;
  }
}
