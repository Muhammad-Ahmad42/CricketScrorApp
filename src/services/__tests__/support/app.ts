import { createSqlJsDatabase, type SqlJsTestDatabase } from '@/db/testing';
import type { AppServices, BootstrapReport, ServiceResult } from '../../contracts';
import { createTestApp, fixedClock, sequentialIds, type TestApp, type TestDeps } from '../../testing';

export interface Harness {
  readonly db: SqlJsTestDatabase;
  readonly app: TestApp;
}

export function expectOk<T>(result: ServiceResult<T>): T {
  if (!result.ok) {
    throw new Error(`Expected ok, got ${result.error.code}: ${result.error.message} (${result.error.domainCode ?? '-'}) ${result.error.detail ?? ''}`);
  }
  return result.value;
}

export function expectFailure<T>(result: ServiceResult<T>, code: string): { readonly message: string; readonly domainCode: string | null; readonly detail: string | null } {
  if (result.ok) {
    throw new Error(`Expected ${code}, got ok`);
  }
  if (result.error.code !== code) {
    throw new Error(`Expected ${code}, got ${result.error.code}: ${result.error.message} ${result.error.detail ?? ''}`);
  }
  return result.error;
}

export async function bootstrapped(app: AppServices): Promise<BootstrapReport> {
  return expectOk(await app.bootstrap());
}

export async function openHarness(overrides: Partial<TestDeps> = {}): Promise<Harness> {
  const db = await createSqlJsDatabase();
  const app = createTestApp(db, overrides);
  await bootstrapped(app);
  return { db, app };
}

let restarts = 0;

function restartDeps(previous: TestApp): Partial<TestDeps> {
  restarts += 1;
  return {
    clock: previous.deps.clock,
    newId: sequentialIds(`r${restarts}`),
    fileSystem: previous.deps.fileSystem,
  };
}

export async function warmRestart(previous: Harness): Promise<Harness & { readonly report: BootstrapReport }> {
  const app = createTestApp(previous.db, restartDeps(previous.app));
  return { db: previous.db, app, report: await bootstrapped(app) };
}

export async function coldRestart(previous: Harness): Promise<Harness & { readonly report: BootstrapReport }> {
  const image = await previous.db.exportAsync();
  const db = await createSqlJsDatabase({ data: image });
  const app = createTestApp(db, restartDeps(previous.app));
  return { db, app, report: await bootstrapped(app) };
}

export async function rowCount(db: SqlJsTestDatabase, table: string, where = '1', params: readonly (string | number)[] = []): Promise<number> {
  const row = await db.getFirstAsync<{ readonly n: number }>(`SELECT count(*) AS n FROM ${table} WHERE ${where}`, [...params]);
  return row?.n ?? 0;
}

export { fixedClock, sequentialIds };
