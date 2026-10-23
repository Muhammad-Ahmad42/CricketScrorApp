import { useEffect, type ReactNode } from 'react';

export function routerModule() {
  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
    dismiss: jest.fn(),
    dismissAll: jest.fn(),
    dismissTo: jest.fn(),
    canGoBack: jest.fn(() => true),
  };
  const StackScreen = jest.fn(() => null);
  const Stack = Object.assign(
    jest.fn((props: { readonly children?: ReactNode }) => props.children ?? null),
    { Screen: StackScreen },
  );
  return {
    router,
    useRouter: () => router,
    useLocalSearchParams: jest.fn(() => ({})),
    useFocusEffect: (effect: () => void) => {
      useEffect(() => effect(), [effect]);
    },
    Stack,
  };
}
