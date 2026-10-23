import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import type { CreaseEnd, DeliveryCall, DeliveryDismissalType, PlayerId } from '@/domain/types';
import { noBall, scoreRuns, wicket, wide, type ScoringIntent } from '@/domain/scoring/commands';
import { Banner, Button, IconButton, OptionTile, RadioList, SegmentedControl, Sheet, Text, space } from '@/ui';
import { PickerRow } from '../components/common/PickerRow';
import { DISMISSAL_LABEL, MAIN_DISMISSALS, RARE_DISMISSALS } from '../selectors/labels';
import type { PlayerOption, WicketOptionsVM } from '../selectors/options';

export type SubmitResult = { readonly ok: true } | { readonly ok: false; readonly message: string; readonly code: string | null };

export interface WicketSheetProps {
  readonly visible: boolean;
  readonly options: WicketOptionsVM;
  readonly onSubmit: (intent: ScoringIntent) => Promise<SubmitResult>;
  readonly onClose: () => void;
  readonly title?: string;
}

type Step = 'choose' | 'fielder' | 'detail';

const CALLS: readonly { readonly value: DeliveryCall; readonly label: string; readonly testID: string }[] = [
  { value: 'fair', label: 'Fair', testID: 'wicket-call-fair' },
  { value: 'wide', label: 'Wide', testID: 'wicket-call-wide' },
  { value: 'no_ball', label: 'No ball', testID: 'wicket-call-no-ball' },
];

const SIMPLE: readonly DeliveryDismissalType[] = ['bowled', 'lbw', 'hit_wicket', 'hit_ball_twice'];
const WITH_FIELDER: readonly DeliveryDismissalType[] = ['caught', 'stumped'];
const RUNS_COMPLETED = ['0', '1', '2', '3'] as const;
const LATER = '__later__';
const TWO_COLUMN_MIN_WIDTH = 300;

export function dismissalColumns(windowWidth: number, fontScale: number): 1 | 2 {
  return windowWidth / Math.max(1, fontScale) < TWO_COLUMN_MIN_WIDTH ? 1 : 2;
}

interface DetailState {
  readonly who: 'striker' | 'non_striker';
  readonly end: CreaseEnd;
  readonly runs: number;
  readonly fielders: readonly (PlayerId | null)[];
}

function defaultDetail(): DetailState {
  return { who: 'striker', end: 'striker_end', runs: 0, fielders: [null, null] };
}

export function withoutWicket(call: DeliveryCall, runs: number): ScoringIntent {
  switch (call) {
    case 'wide':
      return wide(runs);
    case 'no_ball':
      return noBall({ runsTo: 'bat', runsRun: runs });
    case 'fair':
      return scoreRuns(runs, { allRun: true });
    default: {
      const unreachable: never = call;
      return unreachable;
    }
  }
}

export function WicketSheet({ visible, options, onSubmit, onClose, title = 'Wicket' }: WicketSheetProps) {
  const [call, setCall] = useState<DeliveryCall>('fair');
  const [step, setStep] = useState<Step>('choose');
  const [dismissal, setDismissal] = useState<DeliveryDismissalType | null>(null);
  const [showRare, setShowRare] = useState(false);
  const [nextId, setNextId] = useState<PlayerId | null | undefined>(undefined);
  const [pickingNext, setPickingNext] = useState(false);
  const [detail, setDetail] = useState<DetailState>(defaultDetail);
  const [pickingFielder, setPickingFielder] = useState<number | null>(null);
  const [failure, setFailure] = useState<{ readonly message: string; readonly code: string | null; readonly runs: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const window = useWindowDimensions();
  const cellStyle = dismissalColumns(window.width, window.fontScale) === 1 ? styles.cellFull : styles.cell;
  const inFlight = useRef(false);
  const committed = useRef(false);
  useEffect(() => {
    if (visible) {
      committed.current = false;
    }
  }, [visible]);

  const nextBatterId = nextId === undefined ? options.nextBatters[0]?.id ?? null : nextId;
  const nextLabel = options.nextBatters.find((option) => option.id === nextBatterId)?.label ?? 'Choose later';
  const allowed = options.dismissalsFor(call);

  const reset = () => {
    setCall('fair');
    setStep('choose');
    setDismissal(null);
    setShowRare(false);
    setNextId(undefined);
    setPickingNext(false);
    setDetail(defaultDetail());
    setPickingFielder(null);
    setFailure(null);
    setBusy(false);
  };
  const close = () => {
    reset();
    onClose();
  };
  const commit = async (intent: ScoringIntent, runs: number) => {
    if (!visible || inFlight.current || committed.current) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    const result = await onSubmit(intent);
    inFlight.current = false;
    setBusy(false);
    if (result.ok) {
      committed.current = true;
      reset();
      return;
    }
    setFailure({ message: result.message, code: result.code, runs });
  };
  const nextField = { nextBatterId };
  const choose = (type: DeliveryDismissalType) => {
    setFailure(null);
    setDismissal(type);
    if (SIMPLE.includes(type)) {
      void commit(wicket({ dismissal: type, call, ...nextField }), 0);
      return;
    }
    if (WITH_FIELDER.includes(type)) {
      setStep('fielder');
      return;
    }
    setDetail(defaultDetail());
    setStep('detail');
  };
  const pickFielder = (fielderId: PlayerId | null) => {
    if (dismissal === null) {
      return;
    }
    void commit(wicket({ dismissal, call, fielderIds: fielderId === null ? [] : [fielderId], ...nextField }), 0);
  };
  const recordDetail = () => {
    if (dismissal === null) {
      return;
    }
    const out = detail.who === 'striker' ? options.striker : options.nonStriker;
    const fielderIds = dismissal === 'run_out' ? detail.fielders.filter((id): id is PlayerId => id !== null) : [];
    void commit(
      wicket({
        dismissal,
        call,
        playerOutId: out?.id,
        dismissalEnd: detail.end,
        runsRun: dismissal === 'run_out' ? detail.runs : 0,
        fielderIds,
        ...nextField,
      }),
      dismissal === 'run_out' ? detail.runs : 0,
    );
  };
  const recordWithoutWicket = (runs: number) => {
    void commit(withoutWicket(call, runs), runs);
  };

  const fielderGrid = (onPick: (id: PlayerId | null) => void, unknownLabel: string, highlight: PlayerId | null, list: readonly PlayerOption[] = options.fielders) => (
    <View style={styles.grid}>
      {list.map((fielder: PlayerOption) => (
        <View key={fielder.id} style={cellStyle}>
          <OptionTile
            kind="action"
            title={fielder.label}
            tag={fielder.tag}
            highlighted={fielder.id === highlight}
            onPress={() => onPick(fielder.id)}
            testID={`wicket-fielder-${fielder.id}`}
          />
        </View>
      ))}
      <View style={cellStyle}>
        <OptionTile kind="action" title={unknownLabel} onPress={() => onPick(null)} testID="wicket-fielder-unknown" />
      </View>
    </View>
  );

  const nextRow =
    options.nextBatters.length === 0 ? (
      <Text variant="subhead" tone="secondary" testID="wicket-text-last">
        {options.lastWicketNote}
      </Text>
    ) : (
      <View>
        <PickerRow label="Next in" value={nextLabel} placeholder={nextBatterId === null} expanded={pickingNext} onPress={() => setPickingNext(!pickingNext)} testID="wicket-next" />
        {pickingNext ? (
          <RadioList
            accessibilityLabel="Next in"
            value={nextBatterId ?? LATER}
            onChange={(value) => {
              setNextId(value === LATER ? null : value);
              setPickingNext(false);
            }}
            choices={[
              ...options.nextBatters.map((option) => ({
                value: option.id,
                label: option.label,
                description: option.detail ?? undefined,
                meta: option.tag ?? undefined,
                testID: `wicket-next-option-${option.id}`,
              })),
              { value: LATER, label: 'Choose later', testID: 'wicket-next-later' },
            ]}
          />
        ) : null}
      </View>
    );

  const failureBlock = failure ? (
    <View style={styles.failure}>
      <Banner tone="danger" message={failure.message} testID="wicket-text-error" />
      {failure.code === 'WICKET_AFTER_RESULT' ? (
        <Button label="Record without wicket" variant="secondary" onPress={() => recordWithoutWicket(failure.runs)} testID="wicket-btn-without" />
      ) : null}
    </View>
  ) : null;

  const dismissalButtons = (list: readonly DeliveryDismissalType[]) =>
    list
      .filter((type) => allowed.includes(type))
      .map((type) => (
        <View key={type} style={cellStyle}>
          <Button label={DISMISSAL_LABEL[type]} variant="secondary" size="lg" fullWidth disabled={busy} onPress={() => choose(type)} testID={`wicket-btn-${type}`} />
        </View>
      ));

  const sheetTitle = step === 'choose' || dismissal === null ? title : DISMISSAL_LABEL[dismissal];
  const bowlerName = options.fielders.find((option) => option.id === options.bowlerId)?.label ?? null;
  const subtitle = [options.strikerLine, bowlerName === null ? null : `${bowlerName} bowling`].filter((part): part is string => part !== null).join(' · ');

  return (
    <Sheet
      visible={visible}
      title={sheetTitle}
      subtitle={subtitle === '' ? undefined : subtitle}
      onClose={close}
      leading={step === 'choose' ? undefined : <IconButton icon="chevron-left" accessibilityLabel="Back to dismissals" onPress={() => setStep('choose')} testID="wicket-btn-back" />}
      testID="sheet-wicket"
    >
      <View style={styles.body}>
        {step === 'choose' ? (
          <>
            <View style={styles.callRow}>
              <Text variant="subhead" tone="secondary">
                Delivery
              </Text>
              <SegmentedControl options={CALLS} value={call} onChange={setCall} accessibilityLabel="Delivery" />
            </View>
            {nextRow}
            {options.isFreeHit ? <Banner tone="warning" message="Free hit: only run out or obstruction" testID="wicket-text-free-hit" /> : null}
            <View style={styles.grid}>{dismissalButtons(MAIN_DISMISSALS)}</View>
            {showRare ? (
              <View style={styles.grid}>{dismissalButtons(RARE_DISMISSALS)}</View>
            ) : RARE_DISMISSALS.some((type) => allowed.includes(type)) ? (
              <Button label="More dismissals" variant="tertiary" size="sm" onPress={() => setShowRare(true)} testID="wicket-btn-more" />
            ) : null}
          </>
        ) : null}
        {step === 'fielder' ? (
          <>
            {nextRow}
            <Text variant="headline">{dismissal === 'stumped' ? 'Who made the stumping?' : 'Who took the catch?'}</Text>
            {dismissal === 'stumped'
              ? fielderGrid(pickFielder, 'Keeper not known', options.keeperId, options.stumpers)
              : fielderGrid(pickFielder, 'Catcher not known', null)}
          </>
        ) : null}
        {step === 'detail' ? (
          <>
            <Text variant="subhead" tone="secondary">
              {"Who's out"}
            </Text>
            <RadioList
              choices={[
                { value: 'striker', label: options.striker?.label ?? 'Striker', meta: options.striker ? 'Striker' : undefined, testID: 'wicket-who-striker' },
                { value: 'non_striker', label: options.nonStriker?.label ?? 'Non-striker', meta: options.nonStriker ? 'Non-striker' : undefined, testID: 'wicket-who-non-striker' },
              ]}
              value={detail.who}
              onChange={(who) => setDetail({ ...detail, who, end: who === 'striker' ? 'striker_end' : 'non_striker_end' })}
              accessibilityLabel="Who is out"
            />
            <Text variant="subhead" tone="secondary">
              At which end
            </Text>
            <SegmentedControl
              options={[
                { value: 'striker_end', label: "Keeper's end", testID: 'wicket-end-striker' },
                { value: 'non_striker_end', label: "Bowler's end", testID: 'wicket-end-non-striker' },
              ]}
              value={detail.end}
              onChange={(end) => setDetail({ ...detail, end })}
              accessibilityLabel="At which end"
            />
            {dismissal === 'run_out' ? (
              <>
                <Text variant="subhead" tone="secondary">
                  Runs completed
                </Text>
                <SegmentedControl
                  options={RUNS_COMPLETED.map((value) => ({ value, label: value, testID: `wicket-runs-${value}` }))}
                  value={String(detail.runs)}
                  onChange={(value) => setDetail({ ...detail, runs: Number(value) })}
                  accessibilityLabel="Runs completed"
                />
                <Text variant="subhead" tone="secondary">
                  Fielders (optional)
                </Text>
                {(['Thrower', 'At the stumps'] as const).map((label, index) => (
                  <View key={label}>
                    <PickerRow
                      label={label}
                      value={options.fielders.find((option) => option.id === detail.fielders[index])?.label ?? 'Choose'}
                      placeholder={detail.fielders[index] === null}
                      expanded={pickingFielder === index}
                      onPress={() => setPickingFielder(pickingFielder === index ? null : index)}
                      testID={`wicket-fielder-slot-${index}`}
                    />
                    {pickingFielder === index
                      ? fielderGrid(
                          (id) => {
                            const fielders = detail.fielders.map((current, position) => (position === index ? id : current));
                            setDetail({ ...detail, fielders });
                            setPickingFielder(null);
                          },
                          'Nobody',
                          null,
                        )
                      : null}
                  </View>
                ))}
              </>
            ) : null}
            {nextRow}
            <Button
              label={dismissal === 'run_out' ? 'Record run out' : 'Record wicket'}
              size="lg"
              fullWidth
              loading={busy}
              onPress={recordDetail}
              testID="wicket-btn-record"
            />
          </>
        ) : null}
        {failureBlock}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
  callRow: { gap: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  cell: { flexBasis: '48%', flexGrow: 1 },
  cellFull: { flexBasis: '100%', flexGrow: 1 },
  failure: { gap: space.xs },
});
