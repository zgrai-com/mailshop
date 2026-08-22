import { Minus, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";

import { toQuery } from "../api";

type Props = {
  url: string;
  title: string;
  onClose: () => void;
};

function imageUrl(url: string): string {
  if (url.startsWith("data:image/") || url.startsWith("/")) return url;
  return `/api/image-proxy${toQuery({ url })}`;
}

export function ImagePreviewModal({ url, title, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);
  const [viewport, setViewport] = useState({ zoom: 1, x: 0, y: 0 });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  function setZoom(nextZoom: number) {
    setViewport((current) => ({ ...current, zoom: Math.min(5, Math.max(0.5, nextZoom)) }));
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: viewport.x, originY: viewport.y };
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setViewport((current) => ({ ...current, x: drag.originX + event.clientX - drag.x, y: drag.originY + event.clientY - drag.y }));
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  function wheelZoom(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    setZoom(viewport.zoom + (event.deltaY < 0 ? 0.2 : -0.2));
  }

  return <dialog
    ref={dialogRef}
    className="image-preview-dialog"
    aria-labelledby="image-preview-title"
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
  >
    <header className="image-preview-header">
      <div><span>IMAGE PREVIEW</span><h2 id="image-preview-title">{title}</h2></div>
      <div className="image-preview-actions">
        <button className="icon-button" type="button" onClick={() => setZoom(viewport.zoom - 0.25)} aria-label="缩小" title="缩小"><Minus size={17} /></button>
        <output>{Math.round(viewport.zoom * 100)}%</output>
        <button className="icon-button" type="button" onClick={() => setZoom(viewport.zoom + 0.25)} aria-label="放大" title="放大"><Plus size={17} /></button>
        <button className="icon-button" type="button" onClick={() => setViewport({ zoom: 1, x: 0, y: 0 })} aria-label="重置视图" title="重置视图"><RotateCcw size={17} /></button>
        <button className="icon-button" type="button" onClick={onClose} aria-label="关闭" title="关闭"><X size={19} /></button>
      </div>
    </header>
    <div className="image-preview-viewport" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onWheel={wheelZoom}>
      <img src={imageUrl(url)} alt={title} draggable={false} style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }} />
    </div>
  </dialog>;
}
