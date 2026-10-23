import { asSentence, explain, explainedText, HEADLINE_LIMIT, isScannableHeadline, splitExplained, stripPeriod, SUPPORTING_LIMIT } from '..';

describe('splitExplained', () => {
  it('turns the first sentence into the headline and keeps the rest as detail', () => {
    expect(splitExplained("Couldn't save this delivery. Your previous match data is still safe.")).toEqual({
      headline: "Couldn't save this delivery",
      detail: 'Your previous match data is still safe.',
    });
  });

  it('keeps a single sentence as a headline without a trailing period and no detail', () => {
    expect(splitExplained('Choose both teams.')).toEqual({ headline: 'Choose both teams' });
  });

  it('does not split inside overs, quotes or abbreviations without a following capital', () => {
    expect(splitExplained('Tigers are 120/3 after 15.2 overs.')).toEqual({ headline: 'Tigers are 120/3 after 15.2 overs' });
    expect(splitExplained('“Tigers won by 5 runs” no longer stands. The match reopens.')).toEqual({
      headline: '“Tigers won by 5 runs” no longer stands',
      detail: 'The match reopens.',
    });
  });

  it('splits after a closing quote and keeps the remainder whole', () => {
    expect(splitExplained('Match 6 (Final) already has a match. Delete or detach that match first. Then try again.')).toEqual({
      headline: 'Match 6 (Final) already has a match',
      detail: 'Delete or detach that match first. Then try again.',
    });
  });

  it('collapses whitespace', () => {
    expect(splitExplained('  Play is   suspended.\n Resume play first. ')).toEqual({ headline: 'Play is suspended', detail: 'Resume play first.' });
  });
});

describe('explain and explainedText', () => {
  it('builds a headline without a period and a detail that ends as a sentence', () => {
    expect(explain('Match reopens.', 'The result no longer stands')).toEqual({ headline: 'Match reopens', detail: 'The result no longer stands.' });
    expect(explain('NRR not simulated', null)).toEqual({ headline: 'NRR not simulated' });
    expect(explain('NRR not simulated', '   ')).toEqual({ headline: 'NRR not simulated' });
  });

  it('joins a headline and detail back into readable sentences for screen readers', () => {
    expect(explainedText({ headline: 'Match reopens', detail: 'The result no longer stands.' })).toBe('Match reopens. The result no longer stands.');
    expect(explainedText({ headline: 'Is that right?' })).toBe('Is that right?');
  });

  it('strips one trailing period and adds one when needed', () => {
    expect(stripPeriod('Done.')).toBe('Done');
    expect(stripPeriod('Wait...')).toBe('Wait...');
    expect(asSentence('Done')).toBe('Done.');
    expect(asSentence('Done!')).toBe('Done!');
    expect(asSentence('')).toBe('');
  });

  it('measures headlines against the microcopy limits', () => {
    expect(HEADLINE_LIMIT).toBe(40);
    expect(SUPPORTING_LIMIT).toBe(80);
    expect(isScannableHeadline('Wrong batter out on ball 1.3')).toBe(true);
    expect(isScannableHeadline('x'.repeat(41))).toBe(false);
  });
});
