/**
 * The MapCanvas contract.
 *
 * Kept in its own module with no Leaflet import, so screens can type against it
 * without pulling Leaflet into their bundle. That is the reason these types do
 * not live next to the implementation: importing a type from MapCanvasInner
 * would be an import of MapCanvasInner.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Viewport {
  south: number;
  west: number;
  north: number;
  east: number;
  zoom: number;
}

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  /** `centroid` is a crosshair; `report` a dot; `issue` a browse-map pin. */
  kind: "issue" | "report" | "centroid";
  /** A resolved status colour. The map does not own the status vocabulary. */
  color: string;
  overdue?: boolean;
  label?: string;
  /**
   * How many separate people reported this issue. The marker grows with it, so
   * a nine-reporter drain reads before a one-reporter pothole across a whole
   * city — which is the judgement a crew has to make at a glance and the one
   * thing a uniform dot cannot express.
   */
  reporters?: number;
  /** Draws the marker as the selected one: larger, with a ring. */
  selected?: boolean;
  popupHtml?: string;
  onClick?: () => void;
}

export interface MapCircle {
  lat: number;
  lng: number;
  radiusM: number;
  /** accuracy = a report's own GPS circle; merge = effective radius; extentCap = DD-001. */
  style: "accuracy" | "merge" | "extentCap";
}

/** One grid cell of issue density: how many issues, and how many of them are still open. */
export interface MapDensityCell {
  lat: number;
  lng: number;
  issues: number;
  open: number;
}

export interface MapCanvasProps {
  center: LatLng;
  zoom?: number;
  markers?: MapMarker[];
  circles?: MapCircle[];
  height?: number;
  interactive?: boolean;
  onViewportChange?: (v: Viewport) => void;
  onPinPlace?: (lat: number, lng: number) => void;
  fitToMarkers?: boolean;
  /**
   * Shift-drag draws a box and reports its bounds: the split tool's "select by
   * dragging a box" (blueprint 3.18). Leaflet's own shift-drag zoom is turned
   * off when this is set, since the gesture now means something else. Clicking
   * individual markers still works, and is the path on touch screens.
   */
  onBoxSelect?: (bounds: Omit<Viewport, "zoom">) => void;
  /** A ward boundary as GeoJSON text (a MultiPolygon). Drawn as an outline, and the view fits it. */
  boundaryGeoJson?: string;
  /** Issue density, drawn as translucent discs sized by how many issues each cell holds. */
  density?: MapDensityCell[];
}
