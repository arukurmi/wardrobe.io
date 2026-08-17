import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { CATEGORIES, type Category, type GarmentDetail } from '../api/types';
import { countLabel, formatDate } from '../lib/format';
import './GarmentDrawer.css';

export function GarmentDrawer(props: {
  garmentId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [g, setG] = useState<GarmentDetail | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getGarment(props.garmentId).then(setG, () => props.onClose());
  }, [props.garmentId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.onClose]);

  if (!g) return null;

  const save = async (patch: Parameters<typeof api.patchGarment>[1]) => {
    setSaving(true);
    try {
      setG(await api.patchGarment(g.id, patch));
      props.onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside
      className="drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      <header>
        <h2 id="drawer-title">{g.name}</h2>
        <button aria-label="Close garment details" onClick={props.onClose}>
          close
        </button>
      </header>

      {g.coverUrl && <img className="drawer-cover" src={g.coverUrl} alt={g.name} />}

      <div className="drawer-form">
        <label>
          Name
          <input
            defaultValue={g.name}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== g.name) void save({ display_name: v });
            }}
          />
        </label>
        <label>
          Category
          <select
            value={g.category}
            onChange={(e) => void save({ category: e.target.value as Category })}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Brand
          <input
            defaultValue={g.brand ?? ''}
            placeholder="—"
            onBlur={(e) => void save({ brand: e.target.value.trim() || null })}
          />
        </label>
        <label>
          Color
          <input
            defaultValue={g.color ?? ''}
            placeholder="—"
            onBlur={(e) => void save({ color: e.target.value.trim() || null })}
          />
        </label>
        <label>
          Price (₹)
          <input
            type="number"
            min={0}
            defaultValue={g.priceCents != null ? g.priceCents / 100 : ''}
            placeholder="—"
            onBlur={(e) => {
              const v = e.target.value;
              void save({ price_cents: v === '' ? null : Math.round(Number(v) * 100) });
            }}
          />
        </label>
        {saving && <span className="drawer-saving">saving…</span>}
      </div>

      <h3>Seen in {countLabel(g.pieces.length, 'photo')}</h3>
      <div className="drawer-pieces">
        {g.pieces.map((p) => (
          <img key={p.id} src={p.cropUrl} alt="" title={p.photo?.filename} />
        ))}
      </div>

      {g.mergeHistory.length > 0 && (
        <>
          <h3>Merge history</h3>
          <ul className="drawer-merges">
            {g.mergeHistory.map((m) => (
              <li key={m.id}>
                <span>
                  {formatDate(m.created_at)}
                  {m.undone_at ? ' (undone)' : ''}
                </span>
                {!m.undone_at && m.target_garment_id === g.id && (
                  <button
                    onClick={async () => {
                      await api.undoMerge(m.id);
                      setG(await api.getGarment(g.id));
                      props.onChanged();
                    }}
                  >
                    undo
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
