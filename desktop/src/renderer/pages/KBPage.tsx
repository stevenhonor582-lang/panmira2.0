import { useState, type DragEvent } from 'react';

interface Props {
  onUpload: (file: File) => void;
}

export function KBPage({ onUpload }: Props) {
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onUpload(file);
  }

  return (
    <div>
      <div
        data-testid="drop-zone"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: dragOver ? '2px dashed #3b82f6' : '2px dashed #ccc',
          padding: '64px',
          textAlign: 'center'
        }}
      >
        拖入文件到知识库（支持 PDF、DOCX、MD）
      </div>
    </div>
  );
}
