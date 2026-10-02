import { Children, createContext, isValidElement, useContext, useEffect, useSyncExternalStore, type ComponentType, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

export type HrefInput = string | { readonly pathname: string; readonly params?: Readonly<Record<string, unknown>> };

export type Params = Readonly<Record<string, string>>;

export interface GroupDef {
  readonly id: string;
  readonly prefix: string;
  readonly layout: ComponentType | null;
  readonly tabs: boolean;
}

export interface RouteDef {
  readonly pattern: string;
  readonly group: GroupDef;
  readonly screen: ComponentType;
  readonly tab: string | null;
}

interface Entry {
  readonly key: string;
  readonly route: RouteDef;
  readonly path: string;
  readonly params: Params;
}

interface Group {
  readonly key: string;
  readonly def: GroupDef;
  readonly identity: string;
  readonly params: Params;
  readonly entries: readonly Entry[];
}

interface NavState {
  readonly groups: readonly Group[];
}

interface Target {
  readonly def: GroupDef;
  readonly identity: string;
  readonly groupParams: Params;
  readonly entry: Entry;
}

const OutletContext = createContext<ReactNode>(null);
const ParamsContext = createContext<Params>({});
const FocusContext = createContext<boolean>(false);
const ActiveTabContext = createContext<string | null>(null);

let routes: readonly RouteDef[] = [];
let state: NavState = { groups: [] };
let counter = 0;
const listeners = new Set<() => void>();
const unmatched: string[] = [];
const journal: string[] = [];

function segments(path: string): readonly string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}

function dynamicCount(pattern: string): number {
  return segments(pattern).filter((segment) => segment.startsWith('[')).length;
}

function stringParams(params: Readonly<Record<string, unknown>> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null) {
      out[key] = String(value);
    }
  }
  return out;
}

function fill(pathname: string, params: Params): string {
  return pathname.replace(/\[(\w+)\]/g, (_, name: string) => params[name] ?? `[${name}]`);
}

function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const expected = segments(pattern);
  const actual = segments(path);
  if (expected.length !== actual.length) {
    return null;
  }
  const captured: Record<string, string> = {};
  for (let index = 0; index < expected.length; index += 1) {
    const part = expected[index];
    if (part.startsWith('[')) {
      captured[part.slice(1, -1)] = actual[index];
    } else if (part !== actual[index]) {
      return null;
    }
  }
  return captured;
}

function pick(params: Params, prefix: string): Params {
  const names = segments(prefix)
    .filter((segment) => segment.startsWith('['))
    .map((segment) => segment.slice(1, -1));
  return Object.fromEntries(names.map((name) => [name, params[name] ?? '']));
}

function resolve(href: HrefInput): Target | null {
  const raw = typeof href === 'string' ? { pathname: href, params: {} } : { pathname: href.pathname, params: stringParams(href.params) };
  const [pathname] = raw.pathname.split('?');
  const path = fill(pathname, raw.params);
  for (const route of routes) {
    const captured = matchPattern(route.pattern, path);
    if (captured !== null) {
      const params = { ...raw.params, ...captured };
      const groupParams = pick(params, route.group.prefix);
      counter += 1;
      return {
        def: route.group,
        identity: `${route.group.id}|${JSON.stringify(groupParams)}`,
        groupParams,
        entry: { key: `entry-${counter}`, route, path, params },
      };
    }
  }
  unmatched.push(path);
  return null;
}

function newGroup(target: Target): Group {
  counter += 1;
  return { key: `group-${counter}`, def: target.def, identity: target.identity, params: target.groupParams, entries: [target.entry] };
}

function withTop(groups: readonly Group[], entries: readonly Entry[]): readonly Group[] {
  const top = groups[groups.length - 1];
  return [...groups.slice(0, -1), { ...top, entries }];
}

function pushOnto(groups: readonly Group[], target: Target): readonly Group[] {
  const top = groups[groups.length - 1];
  if (top !== undefined && top.identity === target.identity) {
    return withTop(groups, top.def.tabs ? [target.entry] : [...top.entries, target.entry]);
  }
  if (target.def.tabs) {
    const index = groups.map((group) => group.def.tabs).lastIndexOf(true);
    if (index >= 0) {
      const kept = groups.slice(0, index + 1);
      return withTop(kept, [target.entry]);
    }
  }
  return [...groups, newGroup(target)];
}

function commit(groups: readonly Group[], action: string): void {
  state = { groups };
  journal.push(`${action} ${currentPath()}`);
  for (const listener of [...listeners]) {
    listener();
  }
}

function push(href: HrefInput): void {
  const target = resolve(href);
  if (target !== null) {
    commit(pushOnto(state.groups, target), 'push');
  }
}

function replace(href: HrefInput): void {
  const target = resolve(href);
  if (target === null) {
    return;
  }
  const groups = state.groups;
  const top = groups[groups.length - 1];
  if (top !== undefined && top.identity === target.identity) {
    commit(withTop(groups, [...top.entries.slice(0, -1), target.entry]), 'replace');
    return;
  }
  commit(pushOnto(groups.slice(0, -1), target), 'replace');
}

function canGoBack(): boolean {
  const top = state.groups[state.groups.length - 1];
  return state.groups.length > 1 || (top !== undefined && top.entries.length > 1);
}

function back(): void {
  const groups = state.groups;
  const top = groups[groups.length - 1];
  if (top === undefined) {
    return;
  }
  if (top.entries.length > 1) {
    commit(withTop(groups, top.entries.slice(0, -1)), 'back');
  } else if (groups.length > 1) {
    commit(groups.slice(0, -1), 'back');
  }
}

function dismissTo(href: HrefInput): void {
  const target = resolve(href);
  if (target === null) {
    return;
  }
  const groups = state.groups;
  for (let g = groups.length - 1; g >= 0; g -= 1) {
    const found = groups[g].entries.map((entry) => entry.path).lastIndexOf(target.entry.path);
    if (found >= 0) {
      commit(withTop(groups.slice(0, g + 1), groups[g].entries.slice(0, found + 1)), 'dismissTo');
      return;
    }
  }
  commit(pushOnto(groups.slice(0, 1).filter((group) => group.def.tabs), target), 'dismissTo');
}

export const appRouter = {
  push,
  navigate: push,
  replace,
  back,
  canGoBack,
  dismissTo,
  dismiss: back,
  dismissAll: () => commit(state.groups.slice(0, 1), 'dismissAll'),
  canDismiss: canGoBack,
  setParams: () => undefined,
};

export function configureRoutes(table: readonly RouteDef[]): void {
  routes = [...table].sort((a, b) => dynamicCount(a.pattern) - dynamicCount(b.pattern) || segments(b.pattern).length - segments(a.pattern).length);
}

export function startAt(href: HrefInput): void {
  unmatched.length = 0;
  journal.length = 0;
  state = { groups: [] };
  const target = resolve(href);
  if (target !== null) {
    state = { groups: [newGroup(target)] };
  }
}

export function currentPath(): string {
  const top = state.groups[state.groups.length - 1];
  return top?.entries[top.entries.length - 1]?.path ?? '';
}

export function stackPaths(): readonly string[] {
  return state.groups.flatMap((group) => group.entries.map((entry) => entry.path));
}

export function unmatchedPaths(): readonly string[] {
  return [...unmatched];
}

export function navigationJournal(): readonly string[] {
  return [...journal];
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): NavState {
  return state;
}

function Layer({ hidden, children }: { readonly hidden: boolean; readonly children: ReactNode }) {
  return <View style={hidden ? styles.hidden : styles.fill}>{children}</View>;
}

function GroupView({ group, focused }: { readonly group: Group; readonly focused: boolean }) {
  const last = group.entries.length - 1;
  const stack = group.entries.map((entry, index) => {
    const Screen = entry.route.screen;
    return (
      <Layer key={entry.key} hidden={index !== last}>
        <ParamsContext.Provider value={entry.params}>
          <FocusContext.Provider value={focused && index === last}>
            <Screen />
          </FocusContext.Provider>
        </ParamsContext.Provider>
      </Layer>
    );
  });
  const Layout = group.def.layout;
  return (
    <ParamsContext.Provider value={group.params}>
      <ActiveTabContext.Provider value={group.entries[last]?.route.tab ?? null}>
        {Layout === null ? <>{stack}</> : <OutletContext.Provider value={<>{stack}</>}><Layout /></OutletContext.Provider>}
      </ActiveTabContext.Provider>
    </ParamsContext.Provider>
  );
}

export function NavigatorHost({ root: Root }: { readonly root: ComponentType }) {
  const nav = useSyncExternalStore(subscribe, snapshot);
  const last = nav.groups.length - 1;
  const outlet = nav.groups.map((group, index) => (
    <Layer key={group.key} hidden={index !== last}>
      <GroupView group={group} focused={index === last} />
    </Layer>
  ));
  return (
    <OutletContext.Provider value={<>{outlet}</>}>
      <Root />
    </OutletContext.Provider>
  );
}

function Outlet() {
  return <>{useContext(OutletContext)}</>;
}

function StackScreen() {
  return null;
}

const Stack = Object.assign(Outlet, { Screen: StackScreen });

function Passthrough({ children }: { readonly children?: ReactNode }) {
  return <>{children}</>;
}

function useFocusEffect(effect: () => void | (() => void)): void {
  const focused = useContext(FocusContext);
  useEffect(() => (focused ? effect() : undefined), [focused, effect]);
}

interface TabScreenProps {
  readonly name: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

interface TabsProps {
  readonly tabBar: (props: unknown) => ReactNode;
  readonly children?: ReactNode;
}

function Tabs({ tabBar, children }: TabsProps) {
  const outlet = useContext(OutletContext);
  const active = useContext(ActiveTabContext);
  const screens = Children.toArray(children).filter(isValidElement) as ReactElement<TabScreenProps>[];
  const tabRoutes = screens.map((screen) => ({ key: `tab-${screen.props.name}`, name: screen.props.name, params: undefined }));
  const descriptors = Object.fromEntries(screens.map((screen) => [`tab-${screen.props.name}`, { options: screen.props.options ?? {} }]));
  const index = Math.max(0, tabRoutes.findIndex((route) => route.name === active));
  const bar = tabBar({
    state: { index, routes: tabRoutes },
    descriptors,
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
    navigation: {
      emit: () => ({ defaultPrevented: false }),
      navigate: (name: string) => push(name === 'index' ? '/' : `/${name}`),
    },
  });
  return (
    <View style={styles.fill}>
      <View style={styles.fill}>{outlet}</View>
      {bar}
    </View>
  );
}

const TabsWithScreen = Object.assign(Tabs, { Screen: StackScreen });

export const expoRouterModule = {
  router: appRouter,
  useRouter: () => appRouter,
  useLocalSearchParams: () => useContext(ParamsContext),
  useGlobalSearchParams: () => useContext(ParamsContext),
  useFocusEffect,
  Stack,
  ThemeProvider: Passthrough,
};

export const jsTabsModule = {
  Tabs: TabsWithScreen,
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hidden: { display: 'none' },
});
