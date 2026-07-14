import type { QueueItem } from './queue';

export type TrayState = 'hidden' | 'active' | 'settled';

/** What the progress tray should do with the current queue snapshot:
 * hide (nothing to show), stay open (work or errors pending), or linger
 * briefly before dismissing (everything finished cleanly). */
export function trayState(items: QueueItem[]): TrayState {
  if (items.length === 0) return 'hidden';
  if (items.every((i) => i.status === 'done')) return 'settled';
  return 'active';
}
