import { useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { NavShell } from './components/NavShell';
import { DropZone } from './components/DropZone';
import { ProgressTray } from './components/ProgressTray';
import { createUploadQueue } from './upload/wire';
import type { QueueItem } from './upload/queue';
import { Wardrobe } from './views/Wardrobe';
import { Outfits } from './views/Outfits';
import { Review } from './views/Review';
import { Stats } from './views/Stats';

export default function App() {
  const queue = useMemo(createUploadQueue, []);
  const [items, setItems] = useState<QueueItem[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const off = queue.onChange(setItems);
    void queue.restore();
    return off;
  }, [queue]);

  const addFiles = (files: File[]) =>
    queue.add(files.map((f) => ({ name: f.name, blob: f })));

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => {
          addFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      <NavShell onPickFiles={() => fileInput.current?.click()}>
        <Routes>
          <Route path="/" element={<Wardrobe />} />
          <Route path="/outfits" element={<Outfits />} />
          <Route path="/review" element={<Review />} />
          <Route path="/stats" element={<Stats />} />
        </Routes>
      </NavShell>
      <DropZone onFiles={addFiles} />
      <ProgressTray items={items} onRetry={(id) => queue.retry(id)} />
    </>
  );
}
