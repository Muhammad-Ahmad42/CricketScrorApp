import '../../testing';
import { Text as RNText, View } from 'react-native';
import { screen } from '@testing-library/react-native';
import { renderWithTheme, withWindow } from '../../testing';
import { ListRow, PressableRow, Sheet } from '../../primitives';
import { COLUMN_MAX_WIDTH, GUTTERS, Inset, Screen, ScreenHeader, SectionHeader, TwoPane, WIDE_MAX_WIDTH, gutterFor, useGutter, useTwoPane, usesTwoPanes } from '..';

const SIZES = [
  { width: 320, height: 568, gutter: 12 },
  { width: 390, height: 844, gutter: 16 },
  { width: 700, height: 1000, gutter: 24 },
  { width: 820, height: 1180, gutter: 32 },
  { width: 1024, height: 768, gutter: 32 },
] as const;

function Probe({ seen }: { readonly seen: number[] }) {
  seen.push(useGutter());
  return null;
}

describe('responsive gutters', () => {
  it('maps every width class to its gutter: 12 / 16 / 24 / 32', () => {
    expect(GUTTERS).toEqual({ 'compact-s': 12, compact: 16, medium: 24, expanded: 32 });
    expect(gutterFor('compact-s')).toBe(12);
    expect(gutterFor('expanded')).toBe(32);
  });

  it.each(SIZES)('gives Screen content, headers and rows the $gutter pt gutter at $width wide', async ({ width, height, gutter }) => {
    await withWindow({ width, height, fontScale: 1 }, async () => {
      const seen: number[] = [];
      await renderWithTheme(
        <Screen testID="g" inset header={<ScreenHeader title="Fixtures" testID="g-title" />}>
          <Probe seen={seen} />
          <SectionHeader title="Today" testID="g-section" />
          <ListRow title="Northside Strikers v Riverside Lions" onPress={jest.fn()} testID="g-row" />
          <Inset testID="g-inset">
            <RNText>Body</RNText>
          </Inset>
        </Screen>,
      );
      expect(seen[seen.length - 1]).toBe(gutter);
      expect(screen.getByTestId('g-title')).toHaveStyle({ paddingHorizontal: gutter });
      expect(screen.getByTestId('g-inset')).toHaveStyle({ paddingHorizontal: gutter });
      expect(screen.getByTestId('g-row')).toHaveStyle({ paddingHorizontal: gutter });
      const content = screen.getByTestId('g-scroll').props.contentContainerStyle as unknown[];
      expect(content).toEqual(expect.arrayContaining([{ paddingHorizontal: gutter }]));
    });
  });

  it('keeps a reading column on tablets and a wide column for two-pane screens', async () => {
    await withWindow({ width: 1024, height: 768, fontScale: 1 }, async () => {
      await renderWithTheme(
        <Screen testID="narrow">
          <RNText>Body</RNText>
        </Screen>,
      );
      expect(screen.getByTestId('narrow-scroll').props.contentContainerStyle).toEqual(expect.arrayContaining([expect.objectContaining({ maxWidth: COLUMN_MAX_WIDTH })]));
      await renderWithTheme(
        <Screen testID="wide" wide>
          <RNText>Body</RNText>
        </Screen>,
      );
      expect(screen.getByTestId('wide-scroll').props.contentContainerStyle).toEqual(expect.arrayContaining([expect.objectContaining({ maxWidth: WIDE_MAX_WIDTH })]));
    });
  });

  it('uses the sheet gutter inside sheets and lets rows run edge to edge there', async () => {
    await withWindow({ width: 1024, height: 768, fontScale: 1 }, async () => {
      const seen: number[] = [];
      await renderWithTheme(
        <Sheet visible title="Filter" onClose={jest.fn()}>
          <Probe seen={seen} />
          <PressableRow accessibilityLabel="Completed" onPress={jest.fn()} testID="sheet-row">
            <RNText>Completed</RNText>
          </PressableRow>
        </Sheet>,
      );
      expect(seen[seen.length - 1]).toBe(16);
      const row = screen.getByTestId('sheet-row');
      expect(row).toHaveStyle({ paddingLeft: 16 });
      let bleed: unknown = null;
      let node = row.parent;
      while (node && bleed === null) {
        const style = node.props.style as { marginHorizontal?: number } | undefined;
        if (style && typeof style === 'object' && 'marginHorizontal' in style) {
          bleed = style.marginHorizontal;
        }
        node = node.parent;
      }
      expect(bleed).toBe(-16);
    });
  });
});

describe('two panes', () => {
  function Split() {
    return <TwoPane testID="split" ratio={0.4} primary={<RNText>List</RNText>} secondary={<RNText>Detail</RNText>} divider />;
  }

  it('switches to two panes only on expanded windows', () => {
    expect(usesTwoPanes(767)).toBe(false);
    expect(usesTwoPanes(768)).toBe(true);
  });

  it('lays the panes side by side with the gutter between them on a tablet', async () => {
    await withWindow({ width: 1024, height: 768, fontScale: 1 }, async () => {
      const seen: boolean[] = [];
      function Flag() {
        seen.push(useTwoPane());
        return null;
      }
      await renderWithTheme(
        <View>
          <Flag />
          <Split />
        </View>,
      );
      expect(seen[seen.length - 1]).toBe(true);
      expect(screen.getByTestId('split')).toHaveStyle({ flexDirection: 'row', gap: 32 });
      expect(screen.getByTestId('split-primary')).toHaveStyle({ flexGrow: 0.4 });
      expect(screen.getByTestId('split-secondary')).toHaveStyle({ flexGrow: 0.6 });
    });
  });

  it('stacks on phones, or keeps only the primary pane for master-detail', async () => {
    await withWindow({ width: 390, height: 844, fontScale: 1 }, async () => {
      await renderWithTheme(<Split />);
      expect(screen.getByTestId('split')).not.toHaveStyle({ flexDirection: 'row' });
      expect(screen.getByText('Detail')).toBeOnTheScreen();
      await renderWithTheme(<TwoPane testID="md" collapse="primary" primary={<RNText>Rows</RNText>} secondary={<RNText>Pane</RNText>} />);
      expect(screen.queryByText('Pane')).toBeNull();
    });
  });
});
