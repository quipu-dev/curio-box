import { useEffect, useState } from 'react';

interface DropZoneOptions {
  onHtmlDrop: (content: string, filename: string) => void;
  onInvalidDrop?: (message: string) => void;
}

export function useGlobalDropZone({ onHtmlDrop, onInvalidDrop }: DropZoneOptions) {
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      if (!e.relatedTarget) {
        setIsDragOver(false);
      }
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      if (!e.dataTransfer || !e.dataTransfer.files.length) return;

      const file = e.dataTransfer.files[0];
      if (!file.name.endsWith('.html') && !file.type.includes('html')) {
        onInvalidDrop?.('请拖入 .html 格式的工件文件');
        return;
      }

      const text = await file.text();
      onHtmlDrop(text, file.name);
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [onHtmlDrop, onInvalidDrop]);

  return {
    isDragOver,
  };
}
