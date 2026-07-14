import { useState } from 'react';
import { api } from '../api/client';
import { useData } from '../hooks/useData';
import './Settings.css';

export function Settings() {
  const { data: thresholds, refetch } = useData(() => api.getSettings());
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);

  const save = async (patch: { attach?: number; suggest?: number }) => {
    setSaving(true);
    try {
      await api.putSettings(patch);
      refetch();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="settings">
      <h1>Settings</h1>

      <h2>Duplicate matching</h2>
      <p className="dim">
        How similar two pieces must look (CLIP cosine similarity) before they're
        treated as the same garment.
      </p>
      {thresholds && (
        <div className="sliders">
          <label>
            Auto-attach at <strong>{thresholds.attach.toFixed(2)}</strong>
            <input
              type="range"
              min={0.5}
              max={1}
              step={0.01}
              defaultValue={thresholds.attach}
              onMouseUp={(e) => void save({ attach: Number(e.currentTarget.value) })}
              onTouchEnd={(e) => void save({ attach: Number(e.currentTarget.value) })}
            />
            <span className="slider-hint">
              higher = fewer false merges, more duplicates to review
            </span>
          </label>
          <label>
            Suggest review at <strong>{thresholds.suggest.toFixed(2)}</strong>
            <input
              type="range"
              min={0.3}
              max={1}
              step={0.01}
              defaultValue={thresholds.suggest}
              onMouseUp={(e) => void save({ suggest: Number(e.currentTarget.value) })}
              onTouchEnd={(e) => void save({ suggest: Number(e.currentTarget.value) })}
            />
            <span className="slider-hint">
              pieces between the two thresholds land in Review
            </span>
          </label>
          {saving && <span className="dim">saving…</span>}
        </div>
      )}

      <h2>Backup</h2>
      <p className="dim">
        Everything — photos, crops, garments, settings — in one zip.
      </p>
      <div className="backup-row">
        <a className="button-link" href="/api/io/export" download>
          Export wardrobe
        </a>
        <label className="button-link">
          Import backup…
          <input
            type="file"
            accept=".zip,application/zip"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setImporting('importing…');
              const form = new FormData();
              form.append('backup', file);
              try {
                const res = await fetch('/api/io/import', { method: 'POST', body: form });
                const body = await res.json();
                setImporting(res.ok ? 'imported ✓ — reload the page' : body.error);
              } catch (err) {
                setImporting(err instanceof Error ? err.message : String(err));
              }
            }}
          />
        </label>
        {importing && <span className="dim">{importing}</span>}
      </div>
      <p className="dim small">
        Import only works into an empty wardrobe (it refuses to overwrite
        existing data).
      </p>
    </section>
  );
}
