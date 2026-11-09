"use client";

/* ==========================================================================
   THE ONLY MODULE IN THIS CODEBASE THAT IMPORTS LEAFLET.
   --------------------------------------------------------------------------
   Do not import "leaflet" anywhere else. Leaflet touches `window` at module
   scope, so importing it from a module the Next.js server renders throws
   `window is not defined` during SSR -- and the failure surfaces as a broken
   page on a route with nothing obviously to do with maps, because the import
   chain reached it transitively.

   This file is never imported directly by a screen. It is loaded only by
   ../MapCanvas.tsx via dynamic(..., { ssr: false }), which is what guarantees
   it is evaluated in the browser and nowhere else.

   The second reason for the boundary is the bundle. Blueprint §8 budgets
   120 KB gzipped for the report composer's initial JS, and Leaflet alone is
   larger than that. Behind a dynamic import, the composer's happy path --
   photo, automatic location, category -- never downloads a map, and Leaflet
   arrives only if GPS accuracy is poor enough to force manual pin placement.
   ========================================================================== */

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapCanvasProps, MapMarker } from "./types";

/**
 * Marker glyphs as divIcons.
 *
 * Not Leaflet's default image markers: those need asset files that break under
 * bundlers, and more importantly a status marker must carry shape as well as
 * colour (see src/lib/status.ts). A `divIcon` lets the marker be inline SVG in
 * the same glyph vocabulary the rest of the interface uses, so the map stays
 * legible in greyscale for the same reason the queue does.
 */
/**
 * Marker radius from the number of people who reported it.
 *
 * sqrt, not linear. A linear scale makes a nine-reporter cluster nine times the
 * area of a one-reporter one, which swallows the street it sits on and buries
 * its neighbours. sqrt keeps the perceived jump proportional to the count while
 * the pin stays a pin, and the cap stops one very-reported issue dominating a
 * whole ward.
 */
function markerRadius(reporters: number | undefined): number {
  const n = Math.max(1, reporters ?? 1);
  return Math.min(5.5 + Math.sqrt(n - 1) * 2.4, 12);
}

function markerIcon(m: MapMarker): L.DivIcon {
  const r = m.kind === "issue" ? markerRadius(m.reporters) : 5.5;
  // The box has to hold the glyph plus its stroke plus the selection ring.
  const size = m.kind === "centroid" ? 22 : Math.ceil(r * 2 + (m.selected ? 12 : 6));
  const stroke = m.overdue ? 3 : 1.5;
  const c = size / 2;

  const svg =
    m.kind === "centroid"
      ? // A crosshair, visually distinct from the report dots it summarises.
        `<svg width="${size}" height="${size}" viewBox="0 0 22 22">
           <circle cx="11" cy="11" r="7" fill="none" stroke="${m.color}" stroke-width="2"/>
           <path d="M11 0v6M11 16v6M0 11h6M16 11h6" stroke="${m.color}" stroke-width="2"/>
         </svg>`
      : m.kind === "report"
        ? // Selected (the split tool) is a dark ring around the dot: a shape
          // cue, so the dot's own colour can stay its status.
          `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
             ${m.selected ? `<circle cx="${c}" cy="${c}" r="${c - 1}" fill="none" stroke="var(--ink)" stroke-width="2"/>` : ""}
             <circle cx="${c}" cy="${c}" r="5" fill="${m.color}" stroke="#fff" stroke-width="2"/>
           </svg>`
        : // An issue on the browse map. Heavier stroke when overdue, so the
          // breached ones read first across a whole city. A selected one gets a
          // halo rather than a colour change, because its colour is its status.
          `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
             ${
               m.selected
                 ? `<circle cx="${c}" cy="${c}" r="${r + 4}" fill="${m.color}" opacity="0.2"/>
                    <circle cx="${c}" cy="${c}" r="${r + 4}" fill="none" stroke="${m.color}" stroke-width="1.5"/>`
                 : ""
             }
             <circle cx="${c}" cy="${c}" r="${r}" fill="${m.color}" stroke="${
               m.overdue ? "var(--ink)" : "var(--surface-raised)"
             }" stroke-width="${stroke}"/>
             ${
               (m.reporters ?? 1) > 1
                 ? `<text x="${c}" y="${c + 3.4}" text-anchor="middle"
                          font-family="system-ui, sans-serif" font-size="${Math.min(r + 2, 11)}"
                          font-weight="600" fill="#ffffff">${m.reporters}</text>`
                 : ""
             }
           </svg>`;

  return L.divIcon({
    html: svg,
    className: "civictrack-marker",
    // Generous hit area around the unchanged status glyph.
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

const CIRCLE_STYLE = {
  // A report's own GPS accuracy. Translucent fill, because several overlapping
  // accuracy circles is the honest picture of a cluster's uncertainty.
  accuracy: { color: "var(--ink-muted)", weight: 1, fillOpacity: 0.08 },
  // The current effective merge radius.
  merge: { color: "var(--st-active)", weight: 2, fillOpacity: 0, dashArray: "6 4" },
  // DD-001's extent cap: maxExtentMultiplier x mergeRadiusM.
  extentCap: { color: "var(--st-pending)", weight: 2, fillOpacity: 0, dashArray: "2 5" },
} as const;

export default function MapCanvasInner({
  center,
  zoom = 15,
  preserveZoomOnCenterChange = false,
  markers = [],
  circles = [],
  height = 420,
  interactive = true,
  onViewportChange,
  onPinPlace,
  fitToMarkers = false,
  onBoxSelect,
  boundaryGeoJson,
  density = [],
}: MapCanvasProps) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const previousZoom = useRef(zoom);

  // Callbacks live in refs so a parent re-rendering with a new closure does not
  // tear down and rebuild the map, which would reset the viewport out from
  // under a user mid-pan. They are written in an effect rather than during
  // render: a render that mutates a ref is not a pure render, and under a
  // memoising compiler the write may not happen when you think it does.
  const viewportCb = useRef(onViewportChange);
  const pinCb = useRef(onPinPlace);
  const boxCb = useRef(onBoxSelect);

  useEffect(() => {
    viewportCb.current = onViewportChange;
    pinCb.current = onPinPlace;
    boxCb.current = onBoxSelect;
  }, [onViewportChange, onPinPlace, onBoxSelect]);

  useEffect(() => {
    if (!nodeRef.current || mapRef.current) return;

    const map = L.map(nodeRef.current, {
      center: [center.lat, center.lng],
      zoom,
      zoomControl: interactive,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      touchZoom: interactive,
      keyboard: interactive,
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // The desktop workspace changes size when a detail panel or disclosure
    // opens. Leaflet observes window resize, but also needs container resize.
    const resize = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resize.observe(nodeRef.current);

    let timer: number | undefined;
    if (viewportCb.current) {
      // 300ms debounce on moveend, per blueprint §3.4. Without it a single pan
      // fires a marker query per animation frame.
      map.on("moveend", () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          const b = map.getBounds();
          viewportCb.current?.({
            south: b.getSouth(),
            west: b.getWest(),
            north: b.getNorth(),
            east: b.getEast(),
            zoom: map.getZoom(),
          });
        }, 300);
      });
    }

    if (pinCb.current) {
      map.on("click", (e: L.LeafletMouseEvent) => {
        pinCb.current?.(e.latlng.lat, e.latlng.lng);
      });
    }

    if (boxCb.current) {
      // Shift-drag draws a selection box. Dragging is suspended for the
      // gesture, or the map would pan underneath the box being drawn.
      map.boxZoom.disable();
      let start: L.LatLng | null = null;
      let box: L.Rectangle | null = null;
      map.on("mousedown", (e: L.LeafletMouseEvent) => {
        if (!e.originalEvent.shiftKey) return;
        start = e.latlng;
        map.dragging.disable();
      });
      map.on("mousemove", (e: L.LeafletMouseEvent) => {
        if (!start) return;
        const bounds = L.latLngBounds(start, e.latlng);
        if (box) box.setBounds(bounds);
        else box = L.rectangle(bounds, { color: "currentColor", weight: 1, fillOpacity: 0.06 }).addTo(map);
      });
      map.on("mouseup", () => {
        if (!start) return;
        if (box) {
          const b = box.getBounds();
          boxCb.current?.({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
          box.remove();
          box = null;
        }
        start = null;
        if (interactive) map.dragging.enable();
      });
    }

    return () => {
      window.clearTimeout(timer);
      resize.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // Mount-only on purpose. Later prop changes are applied by the effects
    // below rather than by rebuilding the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recentre only when the caller moves the centre, never on every render.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const nextZoom = preserveZoomOnCenterChange && previousZoom.current === zoom
      ? map.getZoom() : zoom;
    previousZoom.current = zoom;
    map.setView([center.lat, center.lng], nextZoom, { animate: false });
  }, [center.lat, center.lng, zoom, preserveZoomOnCenterChange]);

  // Redraw the overlay. Circles first so markers sit above them.
  useEffect(() => {
    const layer = layerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();

    // A ward outline sits under everything else. Neutral navy: density and
    // boundaries are not statuses, so they do not borrow a status colour.
    if (boundaryGeoJson) {
      try {
        const outline = L.geoJSON(JSON.parse(boundaryGeoJson), {
          style: { color: "var(--brand-primary)", weight: 2, fillColor: "var(--brand-primary)", fillOpacity: 0.04 },
        }).addTo(layer);
        map.fitBounds(outline.getBounds(), { padding: [16, 16], animate: false });
      } catch {
        // A boundary that does not parse is a data fault; the map still works without it.
      }
    }

    for (const cell of density) {
      L.circle([cell.lat, cell.lng], {
        radius: 45 + 28 * Math.sqrt(cell.issues),
        color: "var(--brand-primary)",
        weight: 1,
        fillColor: "var(--brand-primary)",
        fillOpacity: Math.min(0.55, 0.18 + 0.08 * cell.issues),
      })
        .bindTooltip(`${cell.issues} issue${cell.issues === 1 ? "" : "s"}, ${cell.open} open`)
        .addTo(layer);
    }

    for (const c of circles) {
      L.circle([c.lat, c.lng], { radius: c.radiusM, ...CIRCLE_STYLE[c.style] }).addTo(layer);
    }

    for (const m of markers) {
      const marker = L.marker([m.lat, m.lng], {
        icon: markerIcon(m),
        keyboard: true,
        title: m.label,
        alt: m.label ?? "",
      });
      if (m.popupHtml) marker.bindPopup(m.popupHtml);
      if (m.onClick) marker.on("click", m.onClick);
      // Leaflet makes custom div icons focusable but does not activate them
      // as buttons. Give keyboard users the same action as a pointer click.
      if (m.onClick || m.popupHtml) marker.on("keydown", (event: L.LeafletKeyboardEvent) => {
        if (event.originalEvent.key !== "Enter" && event.originalEvent.key !== " ") return;
        L.DomEvent.stop(event.originalEvent);
        marker.fire("click", { latlng: marker.getLatLng(), originalEvent: event.originalEvent });
      });
      marker.addTo(layer);
    }

    if (fitToMarkers && markers.length > 0) {
      const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]));
      // Padded so the outermost accuracy circle is not clipped by the frame.
      map.fitBounds(bounds.pad(0.35), { animate: false, maxZoom: 18 });
    }
  }, [markers, circles, fitToMarkers, boundaryGeoJson, density]);

  return (
    <div
      ref={nodeRef}
      data-map-canvas
      style={{ height, width: "100%", borderRadius: "var(--radius)" }}
      // The map is an interactive region; naming it stops a screen reader
      // announcing an unlabelled group of tile images.
      role="region"
      aria-label={onPinPlace ? "Map: use arrow keys to move, Enter to place a pin at the centre" : "Map"}
      onKeyDown={event => {
        // Leaflet provides keyboard panning; expose the same pin placement
        // action as a pointer click without intercepting its child controls.
        if (event.key !== "Enter" || event.target !== event.currentTarget || !pinCb.current || !mapRef.current) return;
        event.preventDefault();
        const point = mapRef.current.getCenter();
        pinCb.current(point.lat, point.lng);
      }}
    />
  );
}
