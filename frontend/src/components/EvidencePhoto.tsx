"use client";

import { useRef } from "react";
import { Photo } from "./Photo";

/** Bounded preview with an accessible full-size view; evidence is never cropped away. */
export function EvidencePhoto({ src, label }: { src: string | null | undefined; label: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <figure className="evidence-photo">
    <button type="button" className="evidence-photo-open" aria-label={`Open ${label} photo`} onClick={() => dialog.current?.showModal()}>
      <Photo src={src} alt={label} width={160} height={120} />
    </button>
    <figcaption className="text-meta text-ink-muted">{label}</figcaption>
    <dialog ref={dialog} className="evidence-dialog" aria-label={`${label} full-size photo`} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="evidence-dialog-heading"><h2 className="text-heading">{label}</h2><button type="button" onClick={() => dialog.current?.close()}>Close photo</button></div>
      <Photo src={src} alt={label} width={1200} height={900} />
    </dialog>
  </figure>;
}
