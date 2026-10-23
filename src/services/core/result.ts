import { splitExplained } from '@/domain/text';
import type { ServiceError, ServiceErrorCode, ServiceResult } from '../contracts';

export interface ServiceErrorExtra {
  readonly domainCode?: string | null;
  readonly detail?: string | null;
  readonly headline?: string;
  readonly supporting?: string | null;
}

export function ok<T>(value: T): ServiceResult<T> {
  return { ok: true, value };
}

export function fail<T>(error: ServiceError): ServiceResult<T> {
  return { ok: false, error };
}

export function serviceError(code: ServiceErrorCode, message: string, extra: ServiceErrorExtra = {}): ServiceError {
  const parts = splitExplained(message);
  const supporting = extra.headline === undefined ? (parts.detail ?? null) : (extra.supporting ?? null);
  return {
    code,
    message,
    domainCode: extra.domainCode ?? null,
    detail: extra.detail ?? null,
    headline: extra.headline ?? parts.headline,
    supporting,
  };
}

export class ServiceFailure extends Error {
  readonly error: ServiceError;

  constructor(error: ServiceError) {
    super(error.message);
    this.name = 'ServiceFailure';
    this.error = error;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function failure(code: ServiceErrorCode, message: string, extra: ServiceErrorExtra = {}): ServiceFailure {
  return new ServiceFailure(serviceError(code, message, extra));
}

export function unwrap<T>(result: ServiceResult<T>): T {
  if (!result.ok) {
    throw new ServiceFailure(result.error);
  }
  return result.value;
}
