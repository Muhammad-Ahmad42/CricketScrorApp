import { createSingleFlight } from '../internal/singleFlight';

describe('createSingleFlight', () => {
  it('runs one task at a time, ignores calls while one is in flight and accepts the next call afterwards', async () => {
    const flight = createSingleFlight();
    let release: (value: string) => void = () => undefined;
    const task = jest.fn(() => new Promise<string>((resolve) => (release = resolve)));
    const first = flight.run(task, 'ignored');
    const second = flight.run(task, 'ignored');
    expect(await second).toBe('ignored');
    release('done');
    expect(await first).toBe('done');
    expect(task).toHaveBeenCalledTimes(1);
    expect(await flight.run(() => Promise.resolve('again'), 'ignored')).toBe('again');
  });

  it('frees the flight when the task throws', async () => {
    const flight = createSingleFlight();
    await expect(flight.run(() => Promise.reject(new Error('boom')), null)).rejects.toThrow('boom');
    expect(await flight.run(() => Promise.resolve(1), 0)).toBe(1);
  });
});
