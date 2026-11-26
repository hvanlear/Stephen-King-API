import { KindTheme, kindTheme } from "../graph/palette";
import type { Status } from "../graph/payload";

// Kinds in display order, set once the graph loads, so a kind the palette
// doesn't know always gets the same spare colour
let order: string[] = [];
export const setKindOrder = (kinds: string[]) => (order = kinds);

export const theme = (kind: string): KindTheme => kindTheme(kind, order);

// A kind's glyph: a span the stylesheet shapes from data-shape, sized by --s
export function glyph(kind: string, size: number, className = "glyph"): HTMLSpanElement {
  const t = theme(kind);
  const el = document.createElement("span");
  el.className = className;
  el.setAttribute("aria-hidden", "true");
  el.dataset.shape = t.shape;
  el.style.setProperty("--c", t.color);
  el.style.setProperty("--s", size + "px");
  return el;
}

// A status mark (♥ alive, † deceased), hidden from screen readers. Where
// it's the only sign of the status, pair it with statusText().
export function mark(status: Status): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = "g-mark";
  el.setAttribute("aria-hidden", "true");
  el.textContent = status.mark;
  return el;
}

// The status in words, for screen readers only: ", deceased"
export function statusText(status: Status): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = "sr-only";
  el.textContent = `, ${status.label}`;
  return el;
}
