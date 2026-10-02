import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { TabBar, type TabBarItem } from './TabBar';
import { tabConfigFor } from './tabs';

export function tabBarItems({ state, navigation, descriptors }: Pick<BottomTabBarProps, 'state' | 'navigation' | 'descriptors'>): TabBarItem[] {
  return state.routes.flatMap((route, index) => {
    const config = tabConfigFor(route.name);
    if (!config) {
      return [];
    }
    const selected = state.index === index;
    const title = descriptors[route.key]?.options.title;
    return [
      {
        key: route.key,
        label: title ?? config.label,
        icon: config.icon,
        selected,
        testID: config.testID,
        onPress: () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!selected && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        },
        onLongPress: () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        },
      },
    ];
  });
}

export function RouterTabBar(props: BottomTabBarProps) {
  return <TabBar items={tabBarItems(props)} bottomInset={props.insets.bottom} />;
}
