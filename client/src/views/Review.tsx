import { api } from '../api/client';
import { CATEGORIES, type Category } from '../api/types';
import { useData } from '../hooks/useData';
import './Review.css';

export function Review() {
  const { data: suggestions, refetch: refetchSugg } = useData(() =>
    api.getSuggestions()
  );
  const { data: photos, refetch: refetchPhotos } = useData(() => api.listPhotos());

  const undetected = photos?.filter((p) => (p.pieces?.length ?? 0) === 0) ?? [];
  const allPieces = photos?.flatMap((p) => p.pieces ?? []) ?? [];

  return (
    <section>
      <h1>Review</h1>

      <h2 className="review-h">
        Possible duplicates{' '}
        {suggestions && suggestions.length > 0 && (
          <span className="badge">{suggestions.length}</span>
        )}
      </h2>
      {suggestions?.length === 0 && <p className="dim">Nothing to review. Clean closet.</p>}
      <div className="sugg-list">
        {suggestions?.map((s) => (
          <div key={s.id} className="sugg">
            <div className="sugg-pair">
              <figure>
                <img src={s.piece.cropUrl} alt="" />
                <figcaption>{s.pieceGarment?.name ?? 'new piece'}</figcaption>
              </figure>
              <div className="sugg-sim">
                {(s.similarity * 100).toFixed(0)}%
                <span>similar</span>
              </div>
              <figure>
                {s.garment.coverUrl ? (
                  <img src={s.garment.coverUrl} alt="" />
                ) : (
                  <div className="sugg-empty" />
                )}
                <figcaption>{s.garment.name}</figcaption>
              </figure>
            </div>
            <div className="sugg-actions">
              <button
                className="primary"
                onClick={async () => {
                  await api.acceptSuggestion(s.id);
                  refetchSugg();
                  refetchPhotos();
                }}
              >
                Same garment — merge
              </button>
              <button
                onClick={async () => {
                  await api.dismissSuggestion(s.id);
                  refetchSugg();
                }}
              >
                Different
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="review-h">
        Photos with nothing detected{' '}
        {undetected.length > 0 && <span className="badge">{undetected.length}</span>}
      </h2>
      {undetected.length === 0 && <p className="dim">Every photo has detected pieces.</p>}
      <div className="undetected-grid">
        {undetected.map((p) => (
          <figure key={p.id}>
            <img src={`/data/photos/${p.filename}`} alt="" loading="lazy" />
            <button
              className="danger"
              onClick={async () => {
                if (confirm('Delete this photo?')) {
                  await api.deletePhoto(p.id);
                  refetchPhotos();
                }
              }}
            >
              delete
            </button>
          </figure>
        ))}
      </div>

      <h2 className="review-h">Fix a piece</h2>
      <p className="dim">Re-label anything the model got wrong, or remove false positives.</p>
      <div className="pieces-table">
        {allPieces.map((p) => (
          <div key={p.id} className="piece-row">
            <img src={p.cropUrl} alt="" />
            <select
              value={p.category}
              onChange={async (e) => {
                await api.patchPiece(p.id, { category: e.target.value as Category });
                refetchPhotos();
              }}
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <button
              className="danger"
              onClick={async () => {
                if (confirm('Remove this piece? The photo stays.')) {
                  await api.deletePiece(p.id);
                  refetchPhotos();
                }
              }}
            >
              remove
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
