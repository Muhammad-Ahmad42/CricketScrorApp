import { useState } from 'react';
import { View } from 'react-native';
import type { MatchRules } from '@/domain/types';
import type { RulesIssue } from '@/domain/scoring/presets';
import { Banner, ListRow, SectionHeader, type StateAction } from '@/ui';
import { scannable } from '@/features/scoring/selectors/scannable';
import { RuleSheet } from '../sheets/RuleSheet';
import { RULE_KEYS, RULE_TITLE, ruleValue, type RuleKey } from '../selectors/rules';

export interface RulesEditorProps {
  readonly rules: MatchRules;
  readonly issues: readonly RulesIssue[];
  readonly onChange: (rules: MatchRules) => void;
  readonly locked?: boolean;
  readonly action?: StateAction;
  readonly hidden?: readonly RuleKey[];
}

export function RulesEditor({ rules, issues, onChange, locked = false, action, hidden = [] }: RulesEditorProps) {
  const [open, setOpen] = useState<RuleKey | null>(null);
  return (
    <View testID="rules-editor">
      <SectionHeader title="Rules" action={action} />
      {issues.map((issue) => {
        const text = scannable(issue);
        return (
          <Banner
            key={`${issue.code}-${issue.message}`}
            tone={issue.severity === 'error' ? 'danger' : 'warning'}
            message={text.headline}
            detail={text.detail}
            testID={`rules-issue-${issue.code}`}
          />
        );
      })}
      {RULE_KEYS.filter((key) => !hidden.includes(key)).map((key) => (
        <ListRow
          key={key}
          title={RULE_TITLE[key]}
          trailing={{ kind: 'value', text: ruleValue(key, rules), chevron: !locked }}
          onPress={locked ? undefined : () => setOpen(key)}
          testID={`rules-row-${key}`}
        />
      ))}
      {open !== null ? (
        <RuleSheet
          key={open}
          ruleKey={open}
          rules={rules}
          onDone={(next) => {
            setOpen(null);
            onChange(next);
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </View>
  );
}
