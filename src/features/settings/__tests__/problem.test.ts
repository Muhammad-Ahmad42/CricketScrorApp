/** @jest-environment node */
import { HEADLINE_LIMIT as HEADLINE_MAX, SUPPORTING_LIMIT as SUPPORTING_MAX } from '@/domain/text';
import { COPY } from '../copy';
import { problemOf, problemText } from '../selectors/problem';
import { serviceError } from './support/fixtures';

const MESSAGES = [
  COPY.settingsLoadFailed,
  COPY.pickerFailed,
  COPY.readFailed,
  COPY.importFailed,
  COPY.exportFailed,
  COPY.shareFailed,
  COPY.checkFailed,
  COPY.detailsShareFailed,
  COPY.tournamentsFailed,
];

describe('settings problems are a short headline plus at most one supporting line (CLAUDE.md Microcopy)', () => {
  it('splits every fallback message into a scannable headline and one supporting line', () => {
    for (const message of MESSAGES) {
      const problem = problemText(message);
      expect([message, problem.headline.length <= HEADLINE_MAX]).toEqual([message, true]);
      expect([message, (problem.supporting ?? '').length <= SUPPORTING_MAX]).toEqual([message, true]);
    }
    expect(problemText(COPY.importFailed)).toEqual({ headline: "Couldn't import this backup", supporting: 'Nothing on this phone was changed.' });
    expect(problemText(COPY.pickerFailed)).toEqual({ headline: "Couldn't open the file picker", supporting: null });
  });

  it('prefers the structured headline a service error carries, then its message, then the fallback', () => {
    expect(problemOf(serviceError({ message: 'Long. Sentence.', headline: 'Short', supporting: 'One line.' }), COPY.importFailed)).toEqual({
      headline: 'Short',
      supporting: 'One line.',
    });
    expect(problemOf(serviceError({ message: "Couldn't share. Try again." }), COPY.shareFailed)).toEqual({ headline: "Couldn't share", supporting: 'Try again.' });
    expect(problemOf(serviceError({ message: 'Whole message.', headline: '  ' }), COPY.shareFailed)).toEqual({ headline: 'Whole message', supporting: null });
    expect(problemOf(null, COPY.exportFailed)).toEqual({ headline: "Couldn't save the backup", supporting: 'Your data is safe.' });
  });
});
