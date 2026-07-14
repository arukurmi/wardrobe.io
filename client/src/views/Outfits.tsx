import { useState } from 'react';
import { api } from '../api/client';
import { useData } from '../hooks/useData';
import { GarmentDrawer } from '../components/GarmentDrawer';
import './Outfits.css';

export function Outfits() {
  const { data: photos, refetch } = useData(() => api.listPhotos());
  const [openGarment, setOpenGarment] = useState<string | null>(null);

  return (
    <section>
      <h1>Outfits</h1>
      {photos && photos.length === 0 && (
        <div className="outfits-empty">
          <p>No photos yet — drop some anywhere.</p>
        </div>
      )}
      <div className="outfits-grid">
        {photos?.map((ph) => (
          <figure key={ph.id} className="outfit">
            <img src={`/data/photos/${ph.filename}`} alt="" loading="lazy" />
            <figcaption>
              <div className="outfit-chips">
                {ph.pieces?.length ? (
                  ph.pieces.map((p) => (
                    <button
                      key={p.id}
                      className="chip"
                      onClick={() => setOpenGarment(p.garmentId)}
                    >
                      {p.category}
                    </button>
                  ))
                ) : (
                  <span className="chip none">no pieces detected</span>
                )}
              </div>
              <button
                className="outfit-delete danger"
                title="Delete photo and its pieces"
                onClick={async () => {
                  if (confirm('Delete this photo and its detected pieces?')) {
                    await api.deletePhoto(ph.id);
                    refetch();
                  }
                }}
              >
                delete
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
      {openGarment && (
        <GarmentDrawer
          garmentId={openGarment}
          onClose={() => setOpenGarment(null)}
          onChanged={refetch}
        />
      )}
    </section>
  );
}
