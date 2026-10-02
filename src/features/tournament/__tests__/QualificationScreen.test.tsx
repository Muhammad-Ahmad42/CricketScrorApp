import '@/ui/testing';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import type { ProposedChange, TournamentSnapshot } from '@/domain/types';
import { renderWithTheme } from '@/ui/testing';
import { QualificationScreen } from '../screens/QualificationScreen';
import { loadTournament, previewOf, resetAll } from './support/harness';
import { useTournamentStore } from './support/mockStores';
import { AT, cupSnapshot, playGroups } from './support/tournament';

jest.mock('@/stores', () => require('./support/mockStores'));
jest.mock('expo-router', () => require('./support/router').expoRouterMock);
jest.mock('expo-crypto', () => require('./support/router').expoCryptoMock);

beforeEach(resetAll);

function knockoutSlot(snapshot: TournamentSnapshot, label: string): { readonly stageId: string; readonly slotId: string } {
  const knockout = [...snapshot.stages].sort((a, b) => a.orderIndex - b.orderIndex)[1];
  const slot = snapshot.slots.find((candidate) => candidate.stageId === knockout.id && candidate.label === label);
  if (!slot) {
    throw new Error(`No slot ${label}`);
  }
  return { stageId: knockout.id, slotId: slot.id };
}

async function rowOf(name: string): Promise<number> {
  for (let n = 1; n <= 8; n += 1) {
    const row = screen.queryByTestId(`qual-row-${n}`);
    if (row && within(row).queryByText(name)) {
      return n;
    }
  }
  throw new Error(`No qualification row for ${name}`);
}

function withOverride(snapshot: TournamentSnapshot): TournamentSnapshot {
  const target = knockoutSlot(snapshot, 'A2');
  return {
    ...snapshot,
    overrides: [
      {
        id: 'ov1',
        tournamentId: 't1',
        kind: 'qualification',
        stageId: target.stageId,
        teamId: 'EAG',
        action: 'qualify',
        slotId: target.slotId,
        poolId: null,
        reason: 'Pool washed out',
        createdAt: AT,
        revokedAt: null,
        revokeReason: null,
      },
    ],
  };
}

function stubFlow() {
  const previewChange = jest.fn(async (change: ProposedChange) => previewOf(change, { requiresReason: true }));
  const applyChange = jest.fn(async () => true);
  useTournamentStore.setState({ previewChange, applyChange });
  return { previewChange, applyChange };
}

describe('QualificationScreen (§44–§47, §51, §98)', () => {
  it('groups teams by status with text and shows each explanation and the rule', async () => {
    loadTournament(playGroups(cupSnapshot(), 6));
    await renderWithTheme(<QualificationScreen tournamentId="t1" />);
    expect(screen.getByTestId('screen-qualification')).toBeOnTheScreen();
    expect(screen.getByTestId('qual-text-rule')).toHaveTextContent('Top 2 from each pool qualify for the Knockouts.');
    expect(screen.getAllByText('Qualified', { exact: true }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Eliminated', { exact: true }).length).toBeGreaterThan(0);
    expect(screen.getByTestId('qual-text-explanation-1')).toHaveTextContent(/Lions have mathematically qualified/);
  });

  it('requires a reason before an override can be reviewed', async () => {
    loadTournament(playGroups(cupSnapshot(), 6));
    const { previewChange } = stubFlow();
    await renderWithTheme(<QualificationScreen tournamentId="t1" />);
    await fireEvent.press(screen.getByTestId(`qual-btn-override-${await rowOf('Eagles')}`));
    await fireEvent.press(screen.getByTestId('override-chip-eliminate'));
    expect(screen.getByTestId('override-btn-apply')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('override-btn-apply'));
    expect(previewChange).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('override-input-reason'), 'Pool washed out');
    expect(screen.getByTestId('override-btn-apply')).toBeEnabled();
  });

  it('applies a qualify override through the impact preview with the given reason', async () => {
    loadTournament(playGroups(cupSnapshot(), 6));
    const { previewChange, applyChange } = stubFlow();
    await renderWithTheme(<QualificationScreen tournamentId="t1" />);
    await fireEvent.press(screen.getByTestId(`qual-btn-override-${await rowOf('Eagles')}`));
    await fireEvent.press(screen.getByTestId('override-chip-qualify'));
    await fireEvent.changeText(screen.getByTestId('override-input-reason'), 'Pool washed out');
    expect(screen.getByTestId('override-btn-apply')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('override-chip-slot-2'));
    await fireEvent.press(screen.getByTestId('override-btn-apply'));
    await waitFor(() => expect(previewChange).toHaveBeenCalled());
    const change = previewChange.mock.calls[0][0];
    expect(change).toMatchObject({
      kind: 'override_apply',
      override: { kind: 'qualification', action: 'qualify', teamId: 'EAG', reason: 'Pool washed out', revokedAt: null, slotId: expect.any(String) },
    });
    expect(screen.getByTestId('impact-input-reason')).toHaveProp('value', 'Pool washed out');
    await fireEvent.press(screen.getByTestId('impact-btn-continue'));
    await waitFor(() => expect(applyChange).toHaveBeenCalledWith(change, 'Pool washed out', expect.anything()));
  });

  it('marks an overridden team clearly as Manual Override with its reason', async () => {
    loadTournament(withOverride(playGroups(cupSnapshot(), 6)));
    await renderWithTheme(<QualificationScreen tournamentId="t1" />);
    const badges = screen.getAllByText('Manual Override');
    expect(badges.length).toBeGreaterThanOrEqual(2);
    const eagles = await rowOf('Eagles');
    expect(screen.getByTestId(`qual-badge-manual-${eagles}`)).toHaveTextContent('Manual Override');
    expect(screen.getByText('Reason: “Pool washed out”')).toBeOnTheScreen();
    expect(screen.getByTestId('qual-row-override-1')).toHaveTextContent(/Eagles qualified for the Knockouts as A2/);
  });

  it('revokes an override through the impact preview with a required reason', async () => {
    loadTournament(withOverride(playGroups(cupSnapshot(), 6)));
    const { previewChange, applyChange } = stubFlow();
    await renderWithTheme(<QualificationScreen tournamentId="t1" />);
    await fireEvent.press(screen.getByTestId('qual-btn-revoke-1'));
    await waitFor(() => expect(previewChange).toHaveBeenCalledWith({ kind: 'override_revoke', overrideId: 'ov1' }));
    expect(screen.getByTestId('impact-btn-continue')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('impact-input-reason'), 'Decision reversed');
    await fireEvent.press(screen.getByTestId('impact-btn-continue'));
    await waitFor(() => expect(applyChange).toHaveBeenCalledWith(expect.anything(), 'Decision reversed', expect.anything()));
  });
});
