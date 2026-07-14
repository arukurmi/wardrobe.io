import { describe, expect, it } from 'vitest';
import { trayState } from '../src/upload/tray-state';
import type { QueueItem } from '../src/upload/queue';

const item = (status: QueueItem['status'], id = 'a'): QueueItem => ({
  id,
  fileName: `${id}.jpg`,
  status,
});

describe('trayState', () => {
  it('is hidden when the queue is empty', () => {
    expect(trayState([])).toBe('hidden');
  });

  it('is active while anything is queued, processing or uploading', () => {
    expect(trayState([item('queued')])).toBe('active');
    expect(trayState([item('processing')])).toBe('active');
    expect(trayState([item('done', 'a'), item('uploading', 'b')])).toBe('active');
  });

  it('is settled when every item finished successfully', () => {
    expect(trayState([item('done', 'a'), item('done', 'b')])).toBe('settled');
  });

  it('stays active while an error needs attention', () => {
    expect(trayState([item('done', 'a'), item('error', 'b')])).toBe('active');
  });
});
