import { splitExplained } from '@/domain/text';
import type { Explained } from '@/domain/types';
import type { AppServices, ServiceError, ServiceErrorCode, ServiceResult } from '@/services/contracts';
import { getAppServices } from '../services';

function scannable(message: string): { readonly headline: string; readonly supporting: string | null } {
  const parts = splitExplained(message);
  return { headline: parts.headline, supporting: parts.detail ?? null };
}

export const UNEXPECTED_MESSAGE = 'Something went wrong. Your data is still safe. Try again.';

export function storeError(code: ServiceErrorCode, message: string, domainCode: string | null = null, explained?: Explained): ServiceError {
  const parts = explained === undefined ? scannable(message) : { headline: explained.headline, supporting: explained.detail ?? null };
  return { code, message, domainCode, detail: null, ...parts };
}

export function unexpected(error: unknown, message: string = UNEXPECTED_MESSAGE): ServiceError {
  return {
    code: 'STORAGE',
    message,
    domainCode: null,
    detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    ...scannable(message),
  };
}

export async function call<T>(task: (services: AppServices) => Promise<ServiceResult<T>>): Promise<ServiceResult<T>> {
  const services = getAppServices();
  try {
    return await task(services);
  } catch (error) {
    return { ok: false, error: unexpected(error) };
  }
}
