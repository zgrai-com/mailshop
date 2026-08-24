import { Minus, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";

import { toQuery } from "../api";

type Props = {
  originalUrl: string;
  resultUrl: string;
  title: string;
  onClose: () => void;
};

type Viewport = { zoom: number; x: number; y: number };

function imageUrl(url: string): string {
  if (url.startsWith("data:image/") || url.startsWith("/")) return url;
  return `/api/image-proxy${toQuery({ url })}`;
}

export function ImageCompareModal({ originalUrl, resultUrl, title, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, x: 0, y: 0 });

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

  const transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;
  const panels = [["原图", originalUrl], ["搜图结果", resultUrl]] as const;

  return <dialog ref={dialogRef} className="image-compare-dialog" aria-labelledby="image-compare-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <header className="task-dialog-header image-compare-header">
      <div><span>IMAGE COMPARISON</span><h2 id="image-compare-title">对比图片</h2><small>{title}</small></div>
      <div className="image-compare-toolbar">
        <button className="icon-button" type="button" onClick={() => setZoom(viewport.zoom - 0.25)} aria-label="缩小" title="缩小"><Minus size={18} /></button>
        <label><span className="sr-only">缩放比例</span><input type="range" min="50" max="500" step="10" value={Math.round(viewport.zoom * 100)} onChange={(event) => setZoom(Number(event.target.value) / 100)} /></label>
        <output>{Math.round(viewport.zoom * 100)}%</output>
        <button className="icon-button" type="button" onClick={() => setZoom(viewport.zoom + 0.25)} aria-label="放大" title="放大"><Plus size={18} /></button>
        <button className="icon-button" type="button" onClick={() => setViewport({ zoom: 1, x: 0, y: 0 })} aria-label="重置视图" title="重置视图"><RotateCcw size={17} /></button>
        <button className="icon-button" type="button" onClick={onClose} aria-label="关闭" title="关闭"><X size={19} /></button>
      </div>
    </header>
    <div className="image-compare-grid">{panels.map(([label, url]) => <section key={label} className="image-compare-panel"><header><strong>{label}</strong><small>拖动平移 · 滚轮缩放</small></header><div className="image-compare-viewport" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onWheel={wheelZoom}><img src={imageUrl(url)} alt={`${title} ${label}`} draggable={false} style={{ transform }} /></div></section>)}</div>
  </dialog>;
}
