import type { SqlDatabase } from '@/db';
import { createAppServices } from '../app/createAppServices';
import type { AppServices, ServiceDeps } from '../contracts';
import { fakePrinter, fakeSharer, fixedClock, memoryFileSystem, seedSource, sequentialIds, type FakePrinter, type FakeSharer, type MemoryFileSystem, type TestClock } from './deps';

export interface TestDeps {
  readonly clock: TestClock;
  readonly newId: ServiceDeps['newId'];
  readonly newSeed: ServiceDeps['newSeed'];
  readonly fileSystem: MemoryFileSystem;
  readonly printer: FakePrinter;
  readonly sharer: FakeSharer;
}

export interface TestApp extends AppServices {
  readonly db: SqlDatabase;
  readonly deps: TestDeps;
}

export function testDeps(overrides: Partial<TestDeps> = {}): TestDeps {
  const fileSystem = overrides.fileSystem ?? memoryFileSystem();
  return {
    clock: overrides.clock ?? fixedClock(),
    newId: overrides.newId ?? sequentialIds('id'),
    newSeed: overrides.newSeed ?? seedSource([847291]),
    fileSystem,
    printer: overrides.printer ?? fakePrinter(fileSystem),
    sharer: overrides.sharer ?? fakeSharer(),
  };
}

export function createTestApp(db: SqlDatabase, overrides: Partial<TestDeps> = {}): TestApp {
  const deps = testDeps(overrides);
  const services = createAppServices({ openDatabase: async () => db, ...deps });
  return { ...services, db, deps };
}
