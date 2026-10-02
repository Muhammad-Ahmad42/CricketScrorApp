export const mockLiquidGlass = { available: false };

jest.mock('expo-glass-effect', () => ({
  ...jest.requireActual<typeof import('expo-glass-effect')>('expo-glass-effect'),
  isLiquidGlassAvailable: () => mockLiquidGlass.available,
  isGlassEffectAPIAvailable: () => true,
}));

export function setLiquidGlassAvailable(available: boolean): void {
  mockLiquidGlass.available = available;
}

export async function withLiquidGlass<T>(run: () => Promise<T> | T): Promise<T> {
  const before = mockLiquidGlass.available;
  mockLiquidGlass.available = true;
  try {
    return await run();
  } finally {
    mockLiquidGlass.available = before;
  }
}
