import { createRef, useEffect, useRef, type RefObject } from 'react';
import { Keyboard, Platform, type ReturnKeyTypeOptions, type TextInput } from 'react-native';

export type SubmitBehavior = 'submit' | 'blurAndSubmit' | 'newline';

export interface FormChainField {
  readonly ref: RefObject<TextInput | null>;
  readonly returnKeyType: ReturnKeyTypeOptions;
  readonly submitBehavior: SubmitBehavior;
  readonly onSubmitEditing: () => void;
}

export interface FormChainOptions<K extends string> {
  readonly onSubmit?: () => void;
  readonly skip?: (key: K) => boolean;
  readonly lastReturnKey?: ReturnKeyTypeOptions;
}

export interface FormChain<K extends string> {
  readonly field: (key: K) => FormChainField;
  readonly focus: (key: K) => boolean;
  readonly next: (key: K) => K | null;
}

export const KEYBOARD_HOLD_MS = 600;

export function nextChainKey<K extends string>(keys: readonly K[], from: K, skip: (key: K) => boolean = () => false): K | null {
  const start = keys.indexOf(from);
  if (start < 0) {
    return null;
  }
  for (let index = start + 1; index < keys.length; index += 1) {
    if (!skip(keys[index])) {
      return keys[index];
    }
  }
  return null;
}

function isFocused(input: TextInput): boolean {
  return typeof input.isFocused === 'function' && input.isFocused() === true;
}

export function showKeyboardFor(input: TextInput, os: string = Platform.OS): void {
  if (os === 'android' && isFocused(input) && !Keyboard.isVisible()) {
    input.blur();
  }
  input.focus();
}

export function holdKeyboard(input: TextInput, os: string = Platform.OS): () => void {
  if (os !== 'android') {
    return () => undefined;
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  const subscription = Keyboard.addListener('keyboardDidHide', () => {
    release();
    if (isFocused(input)) {
      input.blur();
      input.focus();
    }
  });
  const release = () => {
    subscription.remove();
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  timer = setTimeout(release, KEYBOARD_HOLD_MS);
  return release;
}

const NEVER = () => false;

export function useFormChain<K extends string>(keys: readonly K[], options: FormChainOptions<K> = {}): FormChain<K> {
  const refs = useRef(new Map<K, RefObject<TextInput | null>>());
  const onSubmit = useRef(options.onSubmit);
  const held = useRef<(() => void) | null>(null);
  useEffect(() => {
    onSubmit.current = options.onSubmit;
  });
  useEffect(
    () => () => {
      held.current?.();
      held.current = null;
    },
    [],
  );
  const skip = options.skip ?? NEVER;
  const refFor = (key: K): RefObject<TextInput | null> => {
    const existing = refs.current.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const created = createRef<TextInput>();
    refs.current.set(key, created);
    return created;
  };
  const focus = (key: K): boolean => {
    const input = refFor(key).current;
    if (input === null) {
      return false;
    }
    showKeyboardFor(input);
    return true;
  };
  const next = (key: K): K | null => nextChainKey(keys, key, (candidate) => skip(candidate) || refFor(candidate).current === null);
  return {
    focus,
    next,
    field: (key) => {
      const last = nextChainKey(keys, key, skip) === null;
      return {
        ref: refFor(key),
        returnKeyType: last ? (options.lastReturnKey ?? 'done') : 'next',
        submitBehavior: last ? 'blurAndSubmit' : 'submit',
        onSubmitEditing: () => {
          const target = next(key);
          const input = target === null ? null : refFor(target).current;
          if (input !== null) {
            input.focus();
            held.current?.();
            held.current = holdKeyboard(input);
            return;
          }
          onSubmit.current?.();
        },
      };
    },
  };
}
