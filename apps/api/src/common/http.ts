import { createHash, randomBytes } from 'node:crypto';
import type { Response } from 'express';

export const SESSION_COOKIE = 'abapro_session';
export const OIDC_COOKIE = 'abapro_oidc';

const buckets = new Map<string, number[]>();

export function readCookie(request: { headers: { cookie?: string } }, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) {
    return null;
  }
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = part.slice(0, separator).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return null;
}

export interface CookieOptions {
  httpOnly?: boolean;
  secure: boolean;
  path: string;
  maxAgeSeconds: number;
}

export function setCookie(response: Response, name: string, value: string, options: CookieOptions): void {
  response.cookie(name, value, {
    httpOnly: options.httpOnly ?? true,
    secure: options.secure,
    sameSite: 'lax',
    path: options.path,
    maxAge: options.maxAgeSeconds * 1000,
  });
}

export function clearCookie(response: Response, name: string, options: Pick<CookieOptions, 'secure' | 'path'>): void {
  response.clearCookie(name, {
    httpOnly: true,
    secure: options.secure,
    sameSite: 'lax',
    path: options.path,
  });
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function consumeRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  return true;
}

export function resetRateLimits(): void {
  buckets.clear();
}

export function clientAddress(request: { ip?: string; socket?: { remoteAddress?: string | null } }): string {
  return request.ip || request.socket?.remoteAddress || 'unknown';
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string') {
    return '/';
  }
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\') || value.includes('\\')) {
    return '/';
  }
  if (value.includes('\n') || value.includes('\r')) {
    return '/';
  }
  return value;
}

export function asDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }
  return new Date(String(value));
}

export function asString(value: unknown): string {
  return typeof value === 'string' ? value : String(value);
}

export function asNullableString(value: unknown): string | null {
  return value == null ? null : asString(value);
}

export function asBoolean(value: unknown): boolean {
  return value === true || value === 't' || value === 'true';
}

export function asBytes(value: unknown): Buffer | null {
  if (value == null) {
    return null;
  }
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  return null;
}
