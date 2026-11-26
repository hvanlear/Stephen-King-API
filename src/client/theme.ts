import { KindTheme, kindTheme } from "../graph/palette";

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
