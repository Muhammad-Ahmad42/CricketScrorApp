import { useEffect, type ReactNode } from 'react';

export const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  dismissTo: jest.fn(),
  dismissAll: jest.fn(),
  canDismiss: jest.fn(() => true),
  setParams: jest.fn(),
};

export const mockParams: { current: Record<string, string> } = { current: {} };

function Passthrough({ children }: { readonly children?: ReactNode }) {
  return children ?? null;
}

function StackScreen() {
  return null;
}

export const expoRouterMock = {
  useRouter: () => mockRouter,
  router: mockRouter,
  useLocalSearchParams: () => mockParams.current,
  useGlobalSearchParams: () => mockParams.current,
  useFocusEffect: (effect: () => void) => {
    useEffect(() => effect(), [effect]);
  },
  Stack: Object.assign(Passthrough, { Screen: StackScreen }),
};

export function resetRouter(): void {
  for (const fn of Object.values(mockRouter)) {
    fn.mockClear();
  }
  mockRouter.canGoBack.mockImplementation(() => true);
  mockParams.current = {};
}

let nextId = 0;

export const expoCryptoMock = {
  randomUUID: () => {
    nextId += 1;
    return `uuid-${nextId}`;
  },
};
