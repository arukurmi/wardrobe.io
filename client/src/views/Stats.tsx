import { api } from '../api/client';
import { useData } from '../hooks/useData';
import './Stats.css';

const rupees = (cents: number) =>
  `₹${(cents / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export function Stats() {
  const { data: s } = useData(() => api.getStats());
  if (!s) return <h1>Stats</h1>;

  const maxCat = Math.max(1, ...s.byCategory.map((c) => c.count));

  return (
    <section>
      <h1>Stats</h1>

      <div className="tiles">
        <div className="tile">
          <span className="tile-n">{s.totalGarments}</span>
          <span className="tile-l">unique garments</span>
        </div>
        <div className="tile">
          <span className="tile-n">{s.totalPhotos}</span>
          <span className="tile-l">outfit photos</span>
        </div>
        <div className="tile accent">
          <span className="tile-n">{rupees(s.totalValueCents)}</span>
          <span className="tile-l">wardrobe value</span>
        </div>
      </div>

      <div className="stats-cols">
        <div>
          <h2>By category</h2>
          <div className="bars">
            {s.byCategory.map((c) => (
              <div key={c.category} className="bar-row">
                <span className="bar-label">{c.category}</span>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${(c.count / maxCat) * 100}%` }}
                  />
                </div>
                <span className="bar-n">{c.count}</span>
              </div>
            ))}
            {s.byCategory.length === 0 && <p className="dim">No garments yet.</p>}
          </div>
        </div>

        <div>
          <h2>Most worn</h2>
          <ol className="worn-list">
            {s.mostWorn.map((w) => (
              <li key={w.garmentId}>
                <span>{w.name}</span>
                <span className="worn-count">×{w.wearCount}</span>
              </li>
            ))}
            {s.mostWorn.length === 0 && <p className="dim">No wears logged yet.</p>}
          </ol>
        </div>

        <div>
          <h2>Cost per wear</h2>
          <ol className="worn-list">
            {s.costPerWear.map((c) => (
              <li key={c.garmentId}>
                <span>{c.name}</span>
                <span className="worn-count">{rupees(c.cpwCents)}</span>
              </li>
            ))}
            {s.costPerWear.length === 0 && (
              <p className="dim">Add prices to garments to see cost-per-wear.</p>
            )}
          </ol>
        </div>
      </div>
    </section>
  );
}
