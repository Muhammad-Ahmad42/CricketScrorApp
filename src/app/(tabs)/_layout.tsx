import { Tabs } from 'expo-router/js-tabs';
import { RouterTabBar, TAB_ITEMS, TabChrome, useTabScreenOptions } from '@/ui';

export default function TabsLayout() {
  const screenOptions = useTabScreenOptions();
  return (
    <TabChrome>
      <Tabs tabBar={(props) => <RouterTabBar {...props} />} screenOptions={screenOptions}>
        {TAB_ITEMS.map((tab) => (
          <Tabs.Screen key={tab.route} name={tab.route} options={{ title: tab.label, tabBarButtonTestID: tab.testID }} />
        ))}
      </Tabs>
    </TabChrome>
  );
}
