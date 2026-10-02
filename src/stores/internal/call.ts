import type { AppServices, ServiceError, ServiceErrorCode, ServiceResult } from '@/services/contracts';
import { getAppServices } from '../services';

export const UNEXPECTED_MESSAGE = 'Something went wrong. Your data is still safe. Try again.';

export function storeError(code: ServiceErrorCode, message: string, domainCode: string | null = null): ServiceError {
  return { code, message, domainCode, detail: null };
}

export function unexpected(error: unknown, message: string = UNEXPECTED_MESSAGE): ServiceError {
  return { code: 'STORAGE', message, domainCode: null, detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
}

export async function call<T>(task: (services: AppServices) => Promise<ServiceResult<T>>): Promise<ServiceResult<T>> {
  const services = getAppServices();
  try {
    return await task(services);
  } catch (error) {
    return { ok: false, error: unexpected(error) };
  }
}
