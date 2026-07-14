import { useEffect, useState } from 'react';
import type { QueueItem } from '../upload/queue';
import { trayState } from '../upload/tray-state';
import './ProgressTray.css';

const STATUS_LABEL: Record<QueueItem['status'], string> = {
  queued: 'waiting',
  processing: 'detecting pieces…',
  uploading: 'saving…',
  done: 'done',
  error: 'failed',
};

const DISMISS_AFTER_MS = 2000;

export function ProgressTray(props: {
  items: QueueItem[];
  onRetry: (id: string) => void;
}) {
  const state = trayState(props.items);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (state !== 'settled') {
      setDismissed(false);
      return;
    }
    const t = setTimeout(() => setDismissed(true), DISMISS_AFTER_MS);
    return () => clearTimeout(t);
  }, [state, props.items]);

  if (state === 'hidden' || dismissed) return null;

  const visible = props.items.filter((i) => i.status !== 'done');
  const doneCount = props.items.length - visible.length;

  return (
    <aside className={`tray${state === 'settled' ? ' settled' : ''}`}>
      <header>
        <strong>Uploads</strong>
        <span className="tray-count">
          {doneCount}/{props.items.length}
        </span>
      </header>
      {state === 'settled' && <div className="tray-done">all photos saved ✓</div>}
      {visible.slice(0, 8).map((item) => (
        <div key={item.id} className={`tray-item ${item.status}`}>
          <span className="tray-name" title={item.fileName}>
            {item.fileName}
          </span>
          <span className="tray-status">
            {item.status === 'error' ? (
              <>
                <span title={item.error}>{STATUS_LABEL.error}</span>
                <button onClick={() => props.onRetry(item.id)}>retry</button>
              </>
            ) : (
              STATUS_LABEL[item.status]
            )}
          </span>
        </div>
      ))}
      {visible.length > 8 && (
        <div className="tray-more">+{visible.length - 8} more</div>
      )}
    </aside>
  );
}
