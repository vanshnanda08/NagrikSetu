"use client";

import { useRef } from "react";

/** In-page views keep every panel reachable with Tab, arrows, Home and End. */
export function SectionTabs({ label, prefix, items, current, onChange }: {
  label: string; prefix: string; items: { id: string; label: string }[]; current: string; onChange: (id: string) => void;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return <div role="tablist" aria-label={label} className="section-tabs">
    {items.map((item, index) => <button key={item.id} ref={el => { buttons.current[index] = el; }} type="button" role="tab" id={`${prefix}-tab-${item.id}`} aria-selected={current === item.id} aria-controls={`${prefix}-panel-${item.id}`} tabIndex={current === item.id ? 0 : -1} onClick={() => onChange(item.id)} onKeyDown={event => {
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % items.length;
      else if (event.key === "ArrowLeft") next = (index + items.length - 1) % items.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = items.length - 1;
      else return;
      event.preventDefault(); onChange(items[next].id); buttons.current[next]?.focus();
    }}>{item.label}</button>)}
  </div>;
}
