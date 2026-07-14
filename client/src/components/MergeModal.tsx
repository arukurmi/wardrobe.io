import type { Garment } from '../api/types';
import './MergeModal.css';

export function MergeModal(props: {
  source: Garment;
  target: Garment;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { source, target } = props;
  const thumb = (g: Garment) =>
    g.coverUrl ? <img src={g.coverUrl} alt={g.name} /> : <div className="mm-empty" />;
  return (
    <div className="mm-backdrop" onClick={props.onCancel}>
      <div className="mm-box" onClick={(e) => e.stopPropagation()}>
        <h2>Merge these two?</h2>
        <div className="mm-pair">
          <figure>
            {thumb(source)}
            <figcaption>{source.name}</figcaption>
          </figure>
          <span className="mm-arrow">→</span>
          <figure>
            {thumb(target)}
            <figcaption>{target.name}</figcaption>
          </figure>
        </div>
        <p>
          They're the same garment — outfits that referenced{' '}
          <strong>{source.name}</strong> will now show <strong>{target.name}</strong>.
        </p>
        <div className="mm-actions">
          <button onClick={props.onCancel}>Cancel</button>
          <button className="primary" disabled={props.busy} onClick={props.onConfirm}>
            {props.busy ? 'Merging…' : 'Merge'}
          </button>
        </div>
      </div>
    </div>
  );
}
