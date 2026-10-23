/** @jest-environment node */
import { NotFoundError, SquadPlayerInUseError } from '@/db';
import { MESSAGES, toServiceError } from '../core/errors';
import { failure, serviceError } from '../core/result';

const HEADLINE_MAX = 44;
const SUPPORTING_MAX = 80;

describe('service errors are scannable (CLAUDE.md Microcopy)', () => {
  it.each(Object.entries(MESSAGES))('%s splits into a short headline and one supporting line', (_key, message) => {
    const error = serviceError('STORAGE', message);
    expect(error.headline).toBeDefined();
    expect(error.headline!.length).toBeLessThanOrEqual(HEADLINE_MAX);
    expect(error.headline!.endsWith('.')).toBe(false);
    expect((error.supporting ?? '').length).toBeLessThanOrEqual(SUPPORTING_MAX);
    expect(`${error.headline}. ${error.supporting}`).toBe(message);
  });

  it('keeps the full message and the technical detail next to the headline', () => {
    expect(serviceError('VALIDATION', 'This fixture is cancelled. Restore it before starting its match.', { domainCode: 'X', detail: 'tech' })).toEqual({
      code: 'VALIDATION',
      message: 'This fixture is cancelled. Restore it before starting its match.',
      domainCode: 'X',
      detail: 'tech',
      headline: 'This fixture is cancelled',
      supporting: 'Restore it before starting its match.',
    });
  });

  it('uses an explicit headline and supporting line when the caller has one', () => {
    const typed = failure('VALIDATION', 'Shan is now on strike for ball 1.3, but it records Rizwan out caught.', {
      headline: 'Wrong batter out on ball 1.3',
      supporting: 'Shan is now on strike for ball 1.3, but it records Rizwan out caught.',
    });
    expect(typed.error).toMatchObject({
      headline: 'Wrong batter out on ball 1.3',
      supporting: 'Shan is now on strike for ball 1.3, but it records Rizwan out caught.',
    });
    expect(failure('VALIDATION', 'One. Two.', { headline: 'Only a headline' }).error.supporting).toBeNull();
  });

  it('gives mapped storage errors a headline too', () => {
    expect(toServiceError(new NotFoundError('match', 'm1'), MESSAGES.loadMatch)).toMatchObject({
      code: 'NOT_FOUND',
      headline: 'This item no longer exists',
      supporting: 'It may have been deleted.',
    });
    expect(toServiceError(new SquadPlayerInUseError('m1', 'p1'), MESSAGES.matchChange)).toMatchObject({
      headline: 'This player has already played',
      supporting: 'They stay in the squad.',
    });
    expect(toServiceError(new Error('boom'), MESSAGES.record)).toMatchObject({
      code: 'STORAGE',
      headline: "Couldn't save this delivery",
      supporting: 'Your previous match data is still safe.',
    });
  });
});
