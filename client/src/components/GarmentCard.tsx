import type { Garment } from '../api/types';
import './GarmentCard.css';

export function GarmentCard(props: {
  garment: Garment;
  onClick: () => void;
  onMergeRequest: (sourceId: string, targetId: string) => void;
}) {
  const g = props.garment;
  return (
    <article
      className="gcard"
      draggable
      onClick={props.onClick}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/garment-id', g.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('text/garment-id')) {
          e.preventDefault();
          e.currentTarget.classList.add('merge-target');
        }
      }}
      onDragLeave={(e) => e.currentTarget.classList.remove('merge-target')}
      onDrop={(e) => {
        e.preventDefault();
        e.currentTarget.classList.remove('merge-target');
        const sourceId = e.dataTransfer.getData('text/garment-id');
        if (sourceId && sourceId !== g.id) props.onMergeRequest(sourceId, g.id);
      }}
    >
      <div className="gcard-img">
        {g.coverUrl ? (
          <img src={g.coverUrl} alt={g.name} loading="lazy" />
        ) : (
          <div className="gcard-placeholder">{g.category}</div>
        )}
        <span className="gcard-worn">×{g.wearCount}</span>
      </div>
      <footer>
        <span className="gcard-name">{g.name}</span>
        <span className="gcard-meta">
          {[g.brand, g.color].filter(Boolean).join(' · ') || g.category}
        </span>
      </footer>
    </article>
  );
}
