import { AsyncLocalStorage } from 'async_hooks';

export interface TenantStore {
  organizationId?: string;
  userId?: string;
  role?: string;
  actingViaMsspId?: string;
  isDisplayNameLookup?: boolean;
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

  static getActingViaMsspId(): string | undefined {
    return this.getStore()?.actingViaMsspId;
  }

  static isDisplayNameLookup(): boolean {
    return !!this.getStore()?.isDisplayNameLookup;
  }

  static runWithDisplayNameLookup<T>(callback: () => Promise<T> | T): Promise<T> | T {
    const currentStore = this.getStore() || {};
    return this.storage.run({ ...currentStore, isDisplayNameLookup: true }, callback as any);
  }
}
