import { screen } from '@testing-library/react-native';

export function rowSeparatorCount(): number {
  return screen.container.queryAll(
    (node) => typeof node.type === 'string' && node.props.importantForAccessibility === 'no' && node.props.accessibilityElementsHidden === true,
  ).length;
}
