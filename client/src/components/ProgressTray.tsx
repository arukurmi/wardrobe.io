import type { QueueItem } from '../upload/queue';
import './ProgressTray.css';

const STATUS_LABEL: Record<QueueItem['status'], string> = {
  queued: 'waiting',
  processing: 'detecting pieces…',
  uploading: 'saving…',
  done: 'done',
  error: 'failed',
};

export function ProgressTray(props: {
  items: QueueItem[];
  onRetry: (id: string) => void;
}) {
  const visible = props.items.filter((i) => i.status !== 'done');
  const doneCount = props.items.length - visible.length;
  if (props.items.length === 0) return null;
  return (
    <aside className="tray">
      <header>
        <strong>Uploads</strong>
        <span className="tray-count">
          {doneCount}/{props.items.length}
        </span>
      </header>
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
