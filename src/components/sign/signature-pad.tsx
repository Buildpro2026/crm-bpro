"use client";

import { useEffect, useRef } from "react";

// Freehand signature canvas. Reports a PNG data URL once the signer has put
// ink on the canvas, and null when it is cleared or empty.
export function SignaturePad({ onChange }: { onChange: (pngDataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const inked = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 600;
    const cssHeight = 180;
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.6;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0b1f33";
    }
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    inked.current = false;
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        aria-label="Signature drawing area"
        className="signature-pad block h-[180px] w-full rounded-md border-2 border-dashed border-slate-400 bg-white"
        onPointerDown={(e) => {
          drawing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          last.current = point(e);
        }}
        onPointerMove={(e) => {
          if (!drawing.current || !last.current) return;
          const ctx = e.currentTarget.getContext("2d");
          const next = point(e);
          if (ctx) {
            ctx.beginPath();
            ctx.moveTo(last.current.x, last.current.y);
            ctx.lineTo(next.x, next.y);
            ctx.stroke();
          }
          last.current = next;
          inked.current = true;
        }}
        onPointerUp={(e) => {
          drawing.current = false;
          last.current = null;
          if (inked.current) onChange(e.currentTarget.toDataURL("image/png"));
        }}
        onPointerCancel={() => {
          drawing.current = false;
          last.current = null;
        }}
      />
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>Sign with your finger or mouse inside the box.</span>
        <button type="button" onClick={clear} className="font-medium text-sky-900 hover:underline">
          Clear signature
        </button>
      </div>
    </div>
  );
}
