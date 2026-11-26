import type { Graph } from "./model";

// The ego layout: the focus at the centre and its linked records on a ring
// around it, one sector per response field in response order. Pure (no DOM),
// so node:test can check every record at every width.
//
// Labels never overlap. Slots are swept clockwise from the top, each one
// placed at the first angle where its glyph and label clear everything placed
// so far. If the ring can't hold every record, each field keeps its share and
// the rest go behind a "+N field" chip, with the count lowered until it fits.
// Two label styles are tried: centred above or below each record (as in the
// design), and pointing outward at the sides, which fits more on a big hub.

export type Measure = (text: string, px: number, weight: number) => number;

// Rough Inter widths, for tests and until the fonts load
export const estimate: Measure = (text, px, weight) =>
  text.length * px * (weight >= 600 ? 0.6 : 0.56);

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LabelPlace {
  text: string;
  truncated: boolean;
  // A status mark drawn after the text, after a space ("" for none). The
  // rect's width includes it, and truncation never cuts it.
  mark: string;
  // The label's anchor, relative to the record's centre
  dx: number;
  dy: number;
  // start: the label's left edge is at the anchor; end: its right edge; center: centred
  align: "start" | "end" | "center";
  rect: Rect;
}

export interface Slot {
  type: "node" | "chip";
  // A record's index; for a chip, its first hidden record
  i: number;
  field: string;
  family: string;
  note: string;
  // Chips: how many records are behind it, and their kind
  more: number;
  kind: string;
  chipText: string;
  x: number;
  y: number;
  angle: number;
  size: number;
  label: LabelPlace | null;
  rect: Rect;
}

export interface Edge {
  a: number;
  b: number;
  family: string;
  d: string;
  focus: boolean;
}

export interface FieldSummary {
  field: string;
  shown: number;
  more: number;
  total: number;
}

export interface EgoLayout {
  w: number;
  h: number;
  compact: boolean;
  mode: "centered" | "radial";
  focus: { i: number; x: number; y: number; size: number; label: LabelPlace };
  slots: Slot[];
  edges: Edge[];
  fields: FieldSummary[];
}

export interface LayoutOptions {
  // Kinds switched off in the legend
  hidden?: Record<string, boolean>;
  measure?: Measure;
}

// Status marks are drawn larger and bolder than their label, because Inter's
// dagger is a small footnote glyph. home.css sets the same size on .g-mark.
export const MARK_SCALE = 1.3;
export const MARK_WEIGHT = 700;

// The width a mark adds to a label: a space at the label's size, then the mark
export const measureMark = (measure: Measure, mark: string, px: number, weight: number) =>
  mark ? measure(" ", px, weight) + measure(mark, px * MARK_SCALE, MARK_WEIGHT) : 0;

// Below this width the graph uses the phone layout: a square box and fewer records
export const COMPACT_BELOW = 600;

const MARGIN = 8;
const PAD = 3;
const STEP = Math.PI / 360;
const SECTOR_GAP = Math.PI / 90;

export const glyphSize = (kind: string, focus: boolean) => (focus ? 26 : kind === "book" ? 18 : 16);

interface Group {
  field: string;
  family: string;
  items: { i: number; note: string }[];
  show: number;
  more: number;
}

const overlaps = (a: Rect, b: Rect) =>
  a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5;

const grow = (r: Rect, p: number): Rect => ({ x0: r.x0 - p, y0: r.y0 - p, x1: r.x1 + p, y1: r.y1 + p });

const rectAt = (x: number, y: number, w: number, h: number): Rect => ({
  x0: x - w / 2,
  y0: y - h / 2,
  x1: x + w / 2,
  y1: y + h / 2,
});

function curve(ax: number, ay: number, bx: number, by: number, qx: number, qy: number) {
  const f = (n: number) => n.toFixed(1);
  return `M${f(ax)} ${f(ay)} Q${f(qx)} ${f(qy)} ${f(bx)} ${f(by)}`;
}

export function layout(
  g: Graph,
  fi: number,
  box: { w: number; h: number },
  options: LayoutOptions = {}
): EgoLayout {
  const { w, h } = box;
  const compact = w < COMPACT_BELOW;
  const hidden = options.hidden ?? {};
  const raw = options.measure ?? estimate;
  const cache = new Map<string, number>();
  const measure: Measure = (text, px, weight) => {
    const key = px + "/" + weight + "/" + text;
    let v = cache.get(key);
    if (v === undefined) cache.set(key, (v = raw(text, px, weight)));
    return v;
  };

  const N = g.nodes;
  const focus = N[fi];
  const cx = w / 2;
  const cy = h / 2;
  const font = compact ? 12 : 13;
  const lineH = Math.round(font * 1.2) + 4;
  // The widest a ring label may be: generous first, tighter if a hub needs the room
  const labelWidths = compact ? [150, 120] : [250, 180];
  let labelMax = labelWidths[0];
  const ell = measure("…", font, 500);

  // Fits text into `room` px, keeping at least 6 characters. The cut is
  // guessed from the average character width, then measured and shortened
  // until it fits, because real glyph widths vary (a W is wider than an i).
  const fit = (text: string, room: number, px = font, weight = 500) => {
    const full = measure(text, px, weight);
    if (full <= room || text.length <= 6) return { text, width: full, truncated: false };
    let k = Math.min(text.length - 1, Math.max(6, Math.floor((text.length * (room - ell)) / full)));
    const cut = (n: number) => text.slice(0, n).trimEnd() + "…";
    let width = measure(cut(k), px, weight);
    while (width > room && k > 6) width = measure(cut(--k), px, weight);
    return { text: cut(k), width, truncated: true };
  };

  const markWidth = (mark: string, px = font, weight = 500) => measureMark(measure, mark, px, weight);

  // A ring label, with its mark. A series title that doesn't fit shows its
  // subtitle, which is the part that tells "The Dark Tower IV: Wizard and
  // Glass" from the others. The width includes the mark.
  const ringLabel = (text: string, room: number, mark: string) => {
    const mw = markWidth(mark);
    let t = fit(text, room - mw);
    const colon = text.indexOf(": ");
    if (t.truncated && colon >= 0) t = { ...fit(text.slice(colon + 2), room - mw), truncated: true };
    return { ...t, width: t.width + mw };
  };

  // The focus: a glyph with a halo, its name below
  const fSize = glyphSize(focus.kind, true);
  const fFont = compact ? 14 : 16;
  const fMark = focus.status?.mark ?? "";
  const fMarkWidth = markWidth(fMark, fFont, 600);
  const fText = fit(focus.name, Math.min(w - 2 * MARGIN, compact ? 220 : 320) - 12 - fMarkWidth, fFont, 600);
  const fWidth = fText.width + fMarkWidth + 12;
  const fTop = cy + fSize / 2 + 12;
  const focusLabel: LabelPlace = {
    text: fText.text,
    truncated: fText.truncated,
    mark: fMark,
    dx: 0,
    dy: fSize / 2 + 12,
    align: "center",
    rect: { x0: cx - fWidth / 2, y0: fTop, x1: cx + fWidth / 2, y1: fTop + fFont * 1.2 + 4 },
  };
  const focusRects = [rectAt(cx, cy, fSize + 22, fSize + 22), focusLabel.rect].map((r) => grow(r, 6));

  // The records on the ring: each response field's drawn links, heaviest first
  const taken = new Set([fi]);
  const groups: Group[] = [];
  for (const link of focus.links) {
    const items = link.items.filter((e) => {
      if (!focus.drawn.has(e.i) || taken.has(e.i) || hidden[N[e.i].kind]) return false;
      taken.add(e.i);
      return true;
    });
    if (!items.length) continue;
    items.sort(
      (a, b) =>
        Number(b.note === "primary") - Number(a.note === "primary") ||
        N[b.i].weight - N[a.i].weight ||
        N[a.i].id - N[b.i].id ||
        N[a.i].name.localeCompare(N[b.i].name)
    );
    groups.push({ field: link.field, family: link.family, items, show: items.length, more: 0 });
  }
  const total = groups.reduce((s, gr) => s + gr.items.length, 0);

  // Shares out `cap` slots. A field over its share shows its heaviest records
  // and a chip for the rest; the chip takes a slot.
  const allocate = (cap: number) => {
    if (total <= cap) {
      groups.forEach((gr) => ((gr.show = gr.items.length), (gr.more = 0)));
      return;
    }
    const q = groups.map((gr) => Math.max(1, Math.floor((cap * gr.items.length) / total)));
    let used = q.reduce((a, b) => a + b, 0);
    while (used > cap) {
      const m = q.indexOf(Math.max(...q));
      q[m]--;
      used--;
    }
    while (used < cap) {
      let best = -1;
      groups.forEach((gr, k) => {
        if (q[k] < gr.items.length && (best < 0 || gr.items.length - q[k] > groups[best].items.length - q[best])) best = k;
      });
      if (best < 0) break;
      q[best]++;
      used++;
    }
    groups.forEach((gr, k) => {
      if (q[k] >= gr.items.length) {
        gr.show = gr.items.length;
        gr.more = 0;
      } else {
        gr.show = Math.max(0, q[k] - 1);
        gr.more = gr.items.length - gr.show;
      }
    });
  };

  type Spec = Omit<Slot, "x" | "y" | "angle" | "label" | "rect"> & {
    newSector: boolean;
    full: string;
    fullWidth: number;
    mark: string;
  };

  const specs = (): Spec[] => {
    const out: Spec[] = [];
    groups.forEach((gr) => {
      let first = true;
      gr.items.slice(0, gr.show).forEach((e) => {
        const n = N[e.i];
        out.push({
          type: "node",
          i: e.i,
          field: gr.field,
          family: gr.family,
          note: e.note,
          more: 0,
          kind: n.kind,
          chipText: "",
          size: glyphSize(n.kind, false),
          newSector: first,
          full: n.name,
          fullWidth: measure(n.name, font, 500),
          mark: n.status?.mark ?? "",
        });
        first = false;
      });
      if (gr.more) {
        const hiddenFirst = gr.items[gr.show];
        const text = `+${gr.more} ${gr.field}`;
        out.push({
          type: "chip",
          i: hiddenFirst.i,
          field: gr.field,
          family: gr.family,
          note: "",
          more: gr.more,
          kind: N[hiddenFirst.i].kind,
          chipText: text,
          size: 0,
          newSector: first,
          full: text,
          // JetBrains Mono, 12px: 0.6em a character, plus the dot and padding
          fullWidth: text.length * 7.2 + 46,
          mark: "",
        });
      }
    });
    return out;
  };

  // Where a slot sits at angle `a`, with its glyph, label and footprint
  const placeAt = (s: Spec, a: number, mode: "centered" | "radial", rx: number, ry: number) => {
    const x = cx + rx * Math.cos(a);
    const y = cy + ry * Math.sin(a);
    if (s.type === "chip") {
      const rect = rectAt(x, y, s.fullWidth, 44);
      return { x, y, label: null, rect, rects: [grow(rect, PAD)] };
    }
    const half = s.size / 2;
    const glyph = rectAt(x, y, s.size, s.size);
    const cos = Math.cos(a);
    let label: LabelPlace;
    if (mode === "radial" && Math.abs(cos) >= 0.35) {
      // Outward from the side of the ring, vertically centred
      const right = cos > 0;
      const room = Math.min(labelMax, right ? w - MARGIN - (x + half + 8) - 12 : x - half - 8 - MARGIN - 12);
      const t = ringLabel(s.full, room, s.mark);
      const bw = t.width + 12;
      const ax = right ? half + 8 : -(half + 8);
      const x0 = right ? x + ax : x + ax - bw;
      label = {
        text: t.text,
        truncated: t.truncated,
        mark: s.mark,
        dx: ax,
        dy: -lineH / 2,
        align: right ? "start" : "end",
        rect: { x0, y0: y - lineH / 2, x1: x0 + bw, y1: y + lineH / 2 },
      };
    } else {
      // Centred above a record in the top half of the ring, below one in the bottom half
      const above = Math.sin(a) < 0 && mode === "radial" ? true : Math.sin(a) < -0.2;
      const room = Math.min(labelMax, 2 * Math.min(x - MARGIN, w - MARGIN - x) - 12);
      const t = ringLabel(s.full, room, s.mark);
      const bw = t.width + 12;
      const dy = above ? -(half + 6 + lineH) : half + 6;
      label = {
        text: t.text,
        truncated: t.truncated,
        mark: s.mark,
        dx: 0,
        dy,
        align: "center",
        rect: { x0: x - bw / 2, y0: y + dy, x1: x + bw / 2, y1: y + dy + lineH },
      };
    }
    return { x, y, label, rect: glyph, rects: [grow(glyph, PAD), grow(label.rect, PAD)] };
  };

  type Placed = Spec & ReturnType<typeof placeAt> & { angle: number };

  const hits = (rects: Rect[], others: Rect[][]) =>
    others.some((o) => o.some((r) => rects.some((q) => overlaps(q, r))));

  // Whether a slot's glyph or chip, and its label, stay inside the box.
  // Labels are cut to the room they have, but a chip can't be, so a wide one
  // at the side of a narrow ring has to move on round.
  const fits = (p: ReturnType<typeof placeAt>) =>
    [p.rect, p.label?.rect].every(
      (r) => !r || (r.x0 >= MARGIN / 2 && r.y0 >= MARGIN / 2 && r.x1 <= w - MARGIN / 2 && r.y1 <= h - MARGIN / 2)
    );

  // Sweeps one arrangement clockwise from the top, each slot at the first
  // angle where it's clear, at least `gap` past the one before; null if it
  // doesn't fit
  const sweep = (
    list: Spec[],
    mode: "centered" | "radial",
    gap = 0
  ): { placed: Placed[]; rx: number; ry: number } | null => {
    const fixed = 2 * MARGIN + lineH + 6 + 9;
    const ry = Math.max(40, h / 2 - fixed);
    const side =
      mode === "radial"
        ? Math.min(labelMax + 40, w * (compact ? 0.3 : 0.27))
        : Math.min(labelMax / 2 + 14, w * (compact ? 0.2 : 0.16));
    const rx = Math.max(40, w / 2 - side);
    const start = -Math.PI / 2;
    const placed: Placed[] = [];
    for (const s of list) {
      let a = placed.length ? placed[placed.length - 1].angle + STEP + gap + (s.newSector ? SECTOR_GAP : 0) : start;
      for (;;) {
        if (a >= start + 2 * Math.PI) return null;
        const p = placeAt(s, a, mode, rx, ry);
        if (fits(p) && !hits(p.rects, [focusRects, ...placed.map((q) => q.rects)])) {
          placed.push({ ...s, ...p, angle: a });
          break;
        }
        a += STEP;
      }
    }
    if (placed.length > 1) {
      const last = placed[placed.length - 1];
      if (hits(last.rects, [placed[0].rects])) return null;
    }

    return { placed, rx, ry };
  };

  const modes: ("centered" | "radial")[] = ["centered", "radial"];
  const tryCap = (cap: number) => {
    allocate(cap);
    const list = specs();
    for (const width of labelWidths) {
      labelMax = width;
      for (const mode of modes) {
        const r = sweep(list, mode);
        if (r) return { ...r, mode, list };
      }
    }
    return null;
  };

  // The most records that fit, found by halving between one slot per field and the cap
  const lo0 = Math.min(groups.length, total);
  let hi = Math.min(total, compact ? 12 : 28);
  let best = tryCap(hi);
  if (!best && hi > lo0) {
    let lo = lo0;
    let fallback = tryCap(lo);
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      const r = tryCap(mid);
      if (r) {
        lo = mid;
        fallback = r;
      } else hi = mid;
    }
    // Re-run the winner so the groups' shares match it
    best = fallback ? tryCap(lo) : null;
  }
  if (!best) {
    // A box too small for even one slot per field: place them anyway
    allocate(lo0);
    const list = specs();
    const ry = Math.max(40, h / 2 - 40);
    const rx = Math.max(40, w / 2 - 70);
    const placed = list.map((s, k) => {
      const a = -Math.PI / 2 + (2 * Math.PI * k) / Math.max(1, list.length);
      const p = placeAt(s, a, "centered", rx, ry);
      // Labels are cut to fit, but a chip at the side can hang off the box:
      // slide it back in
      const dx = s.type === "chip" ? Math.max(0, MARGIN - p.rect.x0) - Math.max(0, p.rect.x1 - (w - MARGIN)) : 0;
      if (!dx) return { ...s, ...p, angle: a };
      const rect = { ...p.rect, x0: p.rect.x0 + dx, x1: p.rect.x1 + dx };
      return { ...s, ...p, x: p.x + dx, rect, rects: [grow(rect, PAD)], angle: a };
    });
    best = { placed, rx, ry, mode: "centered" as const, list };
  } else if (best.placed.length > 1) {
    // Open the ring up: the widest gap between neighbours that still fits, so
    // the records go all the way round instead of bunching from the top. A
    // gap, not an even share of the spare angle, because a wide chip at the
    // side of the ring needs more angle than a glyph at the top.
    const won = best;
    let lo = 0;
    let hi = (2 * Math.PI) / won.placed.length;
    for (let k = 0; k < 7; k++) {
      const mid = (lo + hi) / 2;
      const r = sweep(won.list, won.mode, mid);
      if (r) {
        lo = mid;
        best = { ...won, ...r };
      } else hi = mid;
    }
  }

  const slots: Slot[] = best.placed.map((p) => ({
    type: p.type,
    i: p.i,
    field: p.field,
    family: p.family,
    note: p.note,
    more: p.more,
    kind: p.kind,
    chipText: p.chipText,
    x: p.x,
    y: p.y,
    angle: p.angle,
    size: p.size,
    label: p.label,
    rect: p.rect,
  }));

  // Lines: the focus to each record, then between records on the ring that
  // list each other, bowed toward the centre so they stay inside the ring
  const edges: Edge[] = [];
  const shown = new Map<number, Slot>();
  for (const s of slots) {
    if (s.type !== "node") continue;
    shown.set(s.i, s);
    const mx = (cx + s.x) / 2;
    const my = (cy + s.y) / 2;
    const dx = s.x - cx;
    const dy = s.y - cy;
    edges.push({ a: fi, b: s.i, family: s.family, focus: true, d: curve(cx, cy, s.x, s.y, mx - dy * 0.08, my + dx * 0.08) });
  }
  const ring = [...shown.values()];
  for (let p = 0; p < ring.length; p++) {
    for (let q = p + 1; q < ring.length; q++) {
      const A = ring[p];
      const B = ring[q];
      const family = N[A.i].drawn.get(B.i);
      if (!family || !N[B.i].drawn.has(A.i)) continue;
      const mx = (A.x + B.x) / 2;
      const my = (A.y + B.y) / 2;
      edges.push({
        a: A.i,
        b: B.i,
        family,
        focus: false,
        d: curve(A.x, A.y, B.x, B.y, mx + (cx - mx) * 0.3, my + (cy - my) * 0.3),
      });
    }
  }

  return {
    w,
    h,
    compact,
    mode: best.mode,
    focus: { i: fi, x: cx, y: cy, size: fSize, label: focusLabel },
    slots,
    edges,
    fields: groups.map((gr) => ({ field: gr.field, shown: gr.show, more: gr.more, total: gr.items.length })),
  };
}
