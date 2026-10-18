import { AsyncLocalStorage } from 'async_hooks';

export interface TenantStore {
  organizationId?: string;
  userId?: string;
  role?: string;
  actingViaMsspId?: string;
  isDisplayNameLookup?: boolean;
  isSystemContext?: boolean;
  txClient?: any;
}

export class TenantContext {
  private static readonly storage = new AsyncLocalStorage<TenantStore>();

  static run<T>(store: TenantStore, callback: () => Promise<T> | T): Promise<T> | T {
    return this.storage.run(store, callback as any);
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

  static isSystemContext(): boolean {
    return !!this.getStore()?.isSystemContext;
  }

  static getTxClient(): any | undefined {
    return this.getStore()?.txClient;
  }

  static runWithTxClient<T>(txClient: any, callback: () => Promise<T> | T): Promise<T> | T {
    const currentStore = this.getStore() || {};
    return this.storage.run({ ...currentStore, txClient }, callback as any);
  }

  static runWithDisplayNameLookup<T>(callback: () => Promise<T> | T): Promise<T> | T {
    const currentStore = this.getStore() || {};
    return this.storage.run({ ...currentStore, isDisplayNameLookup: true }, callback as any);
  }

  static runSystemContext<T>(callback: () => Promise<T> | T): Promise<T> | T {
    const currentStore = this.getStore() || {};
    return this.storage.run({ ...currentStore, isSystemContext: true }, callback as any);
  }
}
