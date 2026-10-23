import { storeError, unexpected, UNEXPECTED_MESSAGE } from '../internal/call';

describe('store errors carry a scannable headline (CLAUDE.md Microcopy)', () => {
  it('splits a store-made message into headline and supporting line', () => {
    expect(storeError('FORBIDDEN_STATE', 'This tournament has already started. Its setup is finished.')).toEqual({
      code: 'FORBIDDEN_STATE',
      message: 'This tournament has already started. Its setup is finished.',
      domainCode: null,
      detail: null,
      headline: 'This tournament has already started',
      supporting: 'Its setup is finished.',
    });
    expect(storeError('VALIDATION', 'Choose both teams.')).toMatchObject({ headline: 'Choose both teams', supporting: null });
  });

  it('takes the domain headline and detail when one is given', () => {
    expect(
      storeError('VALIDATION', 'Lions: 2 players too many. This match is 6 a side. Remove 2 or make them substitutes.', 'SQUAD_TOO_LARGE', {
        headline: 'Lions: 2 players too many',
        detail: 'This match is 6 a side. Remove 2 or make them substitutes.',
      }),
    ).toMatchObject({
      domainCode: 'SQUAD_TOO_LARGE',
      headline: 'Lions: 2 players too many',
      supporting: 'This match is 6 a side. Remove 2 or make them substitutes.',
    });
    expect(storeError('VALIDATION', 'Long message.', null, { headline: 'Short' })).toMatchObject({ headline: 'Short', supporting: null });
  });

  it('gives unexpected failures the reassuring headline', () => {
    expect(unexpected(new Error('boom'))).toMatchObject({
      message: UNEXPECTED_MESSAGE,
      headline: 'Something went wrong',
      supporting: 'Your data is still safe. Try again.',
      detail: 'Error: boom',
    });
  });
});
