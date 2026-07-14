import { useState } from 'react';
import { api } from '../api/client';
import { CATEGORIES, type Category, type Garment } from '../api/types';
import { useData } from '../hooks/useData';
import { GarmentCard } from '../components/GarmentCard';
import { MergeModal } from '../components/MergeModal';
import { GarmentDrawer } from '../components/GarmentDrawer';
import './Wardrobe.css';

export function Wardrobe() {
  const [category, setCategory] = useState<Category | undefined>();
  const [q, setQ] = useState('');
  const { data: garments, refetch } = useData(
    () => api.listGarments({ category, q: q || undefined }),
    [category, q]
  );
  const [merge, setMerge] = useState<{ source: Garment; target: Garment } | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [undoToast, setUndoToast] = useState<string | null>(null);

  const requestMerge = (sourceId: string, targetId: string) => {
    const source = garments?.find((g) => g.id === sourceId);
    const target = garments?.find((g) => g.id === targetId);
    if (source && target) setMerge({ source, target });
  };

  const confirmMerge = async () => {
    if (!merge) return;
    setBusy(true);
    try {
      const { mergeEventId } = await api.mergeGarments(merge.source.id, merge.target.id);
      setMerge(null);
      setUndoToast(mergeEventId);
      setTimeout(() => setUndoToast((t) => (t === mergeEventId ? null : t)), 8000);
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="wardrobe-head">
        <h1>Wardrobe</h1>
        <input
          className="wardrobe-search"
          placeholder="search name, brand, color…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="pills">
        <button
          className={`pill ${!category ? 'on' : ''}`}
          onClick={() => setCategory(undefined)}
        >
          all
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            className={`pill ${category === c ? 'on' : ''}`}
            onClick={() => setCategory(category === c ? undefined : c)}
          >
            {c}
          </button>
        ))}
      </div>

      {garments && garments.length === 0 && (
        <div className="wardrobe-empty">
          <h2>Nothing here yet</h2>
          <p>Drop outfit photos anywhere on this page — pieces show up here.</p>
        </div>
      )}

      <div className="wardrobe-grid">
        {garments?.map((g) => (
          <GarmentCard
            key={g.id}
            garment={g}
            onClick={() => setOpenId(g.id)}
            onMergeRequest={requestMerge}
          />
        ))}
      </div>

      {merge && (
        <MergeModal
          source={merge.source}
          target={merge.target}
          busy={busy}
          onConfirm={confirmMerge}
          onCancel={() => setMerge(null)}
        />
      )}

      {openId && (
        <GarmentDrawer
          garmentId={openId}
          onClose={() => setOpenId(null)}
          onChanged={refetch}
        />
      )}

      {undoToast && (
        <div className="toast">
          Merged.
          <button
            onClick={async () => {
              await api.undoMerge(undoToast);
              setUndoToast(null);
              refetch();
            }}
          >
            Undo
          </button>
        </div>
      )}
    </section>
  );
}
