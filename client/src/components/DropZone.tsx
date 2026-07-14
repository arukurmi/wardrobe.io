import { useEffect, useState } from 'react';
import './DropZone.css';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function DropZone(props: { onFiles: (files: File[]) => void }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      depth++;
      setActive(true);
      e.preventDefault();
    };
    const over = (e: DragEvent) => e.preventDefault();
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setActive(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setActive(false);
      const files = [...(e.dataTransfer?.files ?? [])].filter((f) =>
        IMAGE_TYPES.includes(f.type)
      );
      if (files.length) props.onFiles(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [props.onFiles]);

  if (!active) return null;
  return (
    <div className="dropzone-overlay">
      <div className="dropzone-box">
        <h2>Drop them anywhere</h2>
        <p>photos → pieces → wardrobe</p>
      </div>
    </div>
  );
}
