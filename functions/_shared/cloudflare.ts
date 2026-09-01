export interface D1Result<T = Record<string, unknown>> {
  results?: T[];
  success: boolean;
  meta?: Record<string, unknown>;
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface PublicEnv {
  DB: D1Database;
  CAMPAIGN_CODE?: string;
  CAMPAIGN_TITLE?: string;
  REGISTRATION_OPENS_AT?: string;
  REGISTRATION_CLOSES_AT?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
}

export interface PagesContext<Env> {
  request: Request;
  env: Env;
  waitUntil(promise: Promise<unknown>): void;
  next(): Promise<Response>;
}
