import './support/mocks';
import { setLiquidGlassAvailable } from '@/ui/glass/testing';
import type { ReactElement, ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GLASS_TINT_TEST_ID, ThemeProvider, ToastAnchorProvider, lightColors, lightGlass, useActiveToastAnchor, type ToastAnchor } from '@/ui';
import { TEST_METRICS } from '@/ui/testing';
import { ScoringScreen } from '../screens/ScoringScreen';
import { MatchGate } from '../screens/MatchGate';
import { WizardFrame } from '@/features/match-setup/components/WizardFrame';
import { liveMatch, OPEN } from './support/liveMatch';
import { resetCommonStores, setLive } from './support/render';

const KEYS = ['0', '1', '2', '3', '4', '6', 'extras', 'wicket'] as const;
const FIRST_INNINGS = [OPEN, ...Array.from({ length: 18 }, () => '1')];

let anchor: ToastAnchor | null = null;

function AnchorProbe() {
  anchor = useActiveToastAnchor();
  return null;
}

function Providers({ children, reduceTransparency = false }: { readonly children: ReactNode; readonly reduceTransparency?: boolean }) {
  return (
    <SafeAreaProvider initialMetrics={TEST_METRICS}>
      <ThemeProvider mode="light" reducedMotion="off" reduceTransparency={reduceTransparency}>
        <ToastAnchorProvider>
          {children}
          <AnchorProbe />
        </ToastAnchorProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

async function show(ui: ReactElement, reduceTransparency = false) {
  return render(<Providers reduceTransparency={reduceTransparency}>{ui}</Providers>);
}

beforeAll(() => {
  setLiquidGlassAvailable(false);
});

describe('live scoring glass chrome (§106)', () => {
  beforeEach(() => {
    anchor = null;
    resetCommonStores();
    jest.clearAllMocks();
  });

  it('floats the top bar and score band in the glass header and the action row with the eight keys in the glass dock', async () => {
    setLive(liveMatch([OPEN, '4', '1']));
    await show(<ScoringScreen />);
    const header = screen.getByTestId('score-column-header');
    expect(within(header).getByTestId('score-band')).toBeOnTheScreen();
    expect(within(header).getByTestId('score-top-bar')).toBeOnTheScreen();
    expect(within(header).getByTestId('score-text-score')).toBeOnTheScreen();
    const dock = screen.getByTestId('score-column-footer');
    expect(within(dock).getByTestId('score-row-actions')).toBeOnTheScreen();
    for (const key of KEYS) {
      expect(within(dock).getByTestId(`score-btn-${key}`)).toBeOnTheScreen();
    }
    const middle = screen.getByTestId('score-middle');
    expect(within(middle).getByTestId('score-crease')).toBeOnTheScreen();
    expect(within(header).queryByTestId('score-crease')).not.toBeOnTheScreen();
    expect(within(dock).queryByTestId('score-crease')).not.toBeOnTheScreen();
  });

  it('keeps solid key faces on the dock and gives the pad no well of its own', async () => {
    setLive(liveMatch([OPEN, '1']));
    await show(<ScoringScreen />);
    for (const key of KEYS) {
      expect(screen.getByTestId(`score-btn-${key}`)).toHaveStyle({ backgroundColor: lightColors.surface });
    }
    const dock = screen.getByTestId('score-column-footer');
    const tints = within(dock).getAllByTestId(GLASS_TINT_TEST_ID, { includeHiddenElements: true });
    expect(tints[0]).toHaveStyle({ backgroundColor: lightGlass.level.dock.tint });
  });

  it('lets the batters, bowler and over strip scroll beneath the band and clear of the dock', async () => {
    setLive(liveMatch([OPEN, '1']));
    await show(<ScoringScreen />);
    const middle = screen.getByTestId('score-middle');
    expect(middle).toHaveProp('scrollEventThrottle', 16);
    const content = middle.props.contentContainerStyle;
    const flat = Object.assign({}, ...(Array.isArray(content) ? content : [content]));
    expect(flat.paddingTop).toBeGreaterThanOrEqual(TEST_METRICS.insets.top);
    expect(flat.justifyContent).toBe('flex-end');
  });

  it('anchors toasts under the score band so they never cover the keys', async () => {
    setLive(liveMatch([OPEN, '1']));
    await show(<ScoringScreen />);
    expect(anchor?.edge).toBe('top');
    expect(anchor?.offset ?? 0).toBeGreaterThanOrEqual(TEST_METRICS.insets.top);
  });

  it('uses the secondary ink, never the muted one, on the score band', async () => {
    setLive(liveMatch([OPEN, '1']));
    await show(<ScoringScreen />);
    expect(screen.getByTestId('score-text-overs-of')).toHaveStyle({ color: lightColors.textSecondary });
  });

  it('replaces the dock with the solid pending panel while the score band stays on glass', async () => {
    setLive(liveMatch(FIRST_INNINGS));
    await show(<ScoringScreen />);
    expect(screen.getByTestId('prompt-start-innings')).toBeOnTheScreen();
    expect(screen.queryByTestId('score-column-footer')).not.toBeOnTheScreen();
    expect(within(screen.getByTestId('score-column-header')).getByTestId('score-band')).toBeOnTheScreen();
  });

  it('renders the band and dock opaque with the same tint when transparency is reduced', async () => {
    setLive(liveMatch([OPEN, '1']));
    await show(<ScoringScreen />, true);
    const dock = screen.getByTestId('score-column-footer');
    expect(within(dock).getAllByTestId(GLASS_TINT_TEST_ID, { includeHiddenElements: true })[0]).toHaveStyle({ backgroundColor: lightGlass.level.dock.opaque });
    const header = screen.getByTestId('score-column-header');
    expect(within(header).getAllByTestId(GLASS_TINT_TEST_ID, { includeHiddenElements: true })[0]).toHaveStyle({ backgroundColor: lightGlass.level.bar.opaque });
  });
});

describe('match chrome on other screens (§106)', () => {
  beforeEach(() => {
    resetCommonStores();
    jest.clearAllMocks();
  });

  it('shows the loading gate under a glass top bar', async () => {
    setLive(null);
    await show(
      <MatchGate title="Live scoring">
        <></>
      </MatchGate>,
    );
    expect(within(screen.getByTestId('match-gate-header')).getByText('Live scoring')).toBeOnTheScreen();
    expect(screen.getByTestId('match-gate-loading')).toBeOnTheScreen();
  });

  it('puts the wizard step header in the glass bar and Back / Next in the glass dock', async () => {
    await show(
      <WizardFrame step="teams" onNext={jest.fn()} onClose={jest.fn()}>
        <></>
      </WizardFrame>,
    );
    expect(within(screen.getByTestId('wizard-teams-header')).getByText('Step 2 of 5')).toBeOnTheScreen();
    const footer = screen.getByTestId('wizard-teams-footer');
    expect(within(footer).getByTestId('wizard-btn-back')).toBeOnTheScreen();
    expect(within(footer).getByTestId('wizard-btn-next')).toBeOnTheScreen();
    expect(within(footer).getAllByTestId(GLASS_TINT_TEST_ID, { includeHiddenElements: true })[0]).toHaveStyle({ backgroundColor: lightGlass.level.dock.tint });
  });
});
