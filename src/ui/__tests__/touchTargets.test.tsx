import '../testing';
import { Text as RNText, View } from 'react-native';
import { screen } from '@testing-library/react-native';
import { renderWithTheme, touchTargetSize } from '../testing';
import {
  BallChip,
  Banner,
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
  ScoringPad,
  SectionHeader,
  SegmentedControl,
  StatLine,
  Stepper,
  TabBar,
  Table,
  Tabs,
  TextField,
  Toast,
} from '..';

const INTERACTIVE_ROLES = new Set(['button', 'tab', 'radio', 'switch', 'link', 'togglebutton']);

function Gallery() {
  const noop = () => undefined;
  return (
    <View>
      <Button label="Primary" onPress={noop} />
      <Button label="Small" size="sm" variant="tertiary" onPress={noop} />
      <Button label="Large" size="lg" variant="secondary" onPress={noop} />
      <IconButton icon="undo-2" accessibilityLabel="Undo last ball" onPress={noop} />
      <IconButton icon="arrow-left-right" label="Swap" accessibilityLabel="Swap strike" onPress={noop} />
      <TextField label="Name" value="" onChangeText={noop} />
      <Stepper label="Overs" value={20} onChange={noop} min={1} max={50} />
      <SegmentedControl
        accessibilityLabel="Theme"
        value="a"
        onChange={noop}
        options={[
          { value: 'a', label: 'Light' },
          { value: 'b', label: 'Dark' },
        ]}
      />
      <Tabs accessibilityLabel="Innings" selectedKey="1" onSelect={noop} tabs={[{ key: '1', label: '1st innings' }, { key: '2', label: '2nd innings' }]} />
      <ListRow title="Teams" trailing={{ kind: 'chevron' }} onPress={noop} menu={{ accessibilityLabel: 'More', onPress: noop }} />
      <ListRow title="Vibration" trailing={{ kind: 'switch', value: true, onValueChange: noop }} />
      <Table
        columns={[{ key: 'n', header: 'Team', kind: 'name', value: (r: { n: string }) => r.n }]}
        rows={[{ n: 'Tigers' }]}
        rowKey={(r) => r.n}
        rowAccessibilityLabel={(r) => r.n}
        onRowPress={noop}
      />
      <SectionHeader title="Recent" action={{ label: 'See all', onPress: noop }} />
      <EmptyState title="No matches yet" action={{ label: 'NEW MATCH', onPress: noop }} />
      <ErrorState title="Couldn't load" onRetry={noop} details="x" secondaryAction={{ label: 'Diagnostics', onPress: noop }} />
      <Banner tone="warning" message="Retirement due" action={{ label: 'Retire now', onPress: noop }} />
      <Toast toast={{ id: 't', kind: 'error', message: 'Failed', action: { label: 'Try again', run: noop } }} onDismiss={noop} />
      <StatLine kind="batter" name="Ali" figure="42" active accessibilityLabel="On strike: Ali" onPress={noop} />
      <BallChip kind="four" text="4" size="sm" accessibilityLabel="Four runs" onPress={noop} />
      <TabBar items={[{ key: 'h', label: 'Home', icon: 'house', selected: true, onPress: noop }]} />
      <ScoringPad onRuns={noop} onExtras={noop} onWicket={noop} keyHeight={56} />
      <RNText>end</RNText>
    </View>
  );
}

describe('touch targets (§72)', () => {
  it('gives every interactive element at least 44 × 44 pt including hit slop', async () => {
    const view = await renderWithTheme(<Gallery />);
    const interactive = view.container.queryAll((node) => INTERACTIVE_ROLES.has(String(node.props.accessibilityRole)) && node.props.accessible !== false);
    expect(interactive.length).toBeGreaterThan(30);
    const small = interactive
      .map((node) => ({ label: String(node.props.accessibilityLabel ?? node.props.testID ?? node.type), size: touchTargetSize(node) }))
      .filter(({ size }) => size.height < 44 || size.width < 44);
    expect(small).toEqual([]);
  });

  it('makes the scoring keys larger than the general minimum', async () => {
    await renderWithTheme(<ScoringPad onRuns={jest.fn()} onExtras={jest.fn()} onWicket={jest.fn()} keyHeight={48} />);
    for (const key of screen.getAllByRole('button')) {
      expect(touchTargetSize(key).height).toBeGreaterThanOrEqual(56);
    }
  });
});
