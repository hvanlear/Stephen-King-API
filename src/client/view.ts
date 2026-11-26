import { layout, EgoLayout, Measure, Slot, LabelPlace } from "./layout";
import { Graph, kindLabel } from "./model";
import { glyph, theme } from "./theme";

// Draws a layout into the graph box and animates moves between records.
// Records are real links (they work without the script and open in a new tab
// on a middle-click); lines are SVG behind them. Only transform, opacity and
// the lines' reveal animate, and nothing does with reduced motion.

export interface ViewHandlers {
  go(i: number, viaKeyboard: boolean): void;
  expand(field: string): void;
  hover(i: number | null): void;
  href(i: number): string;
}

const SVG = "http://www.w3.org/2000/svg";
const MOVE_MS = 380;
const EASE = "cubic-bezier(.2,.7,.2,1)";

const at = (x: number, y: number) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;

const labelTransform = (l: LabelPlace) =>
  `translate(calc(${l.dx.toFixed(1)}px + ${l.align === "start" ? "0%" : l.align === "end" ? "-100%" : "-50%"}), ${l.dy.toFixed(1)}px)`;

// Canvas text widths in the page's own fonts, so labels are sized as drawn
function canvasMeasure(): Measure {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return (text, px) => text.length * px * 0.56;
  return (text, px, weight) => {
    ctx.font = `${weight} ${px}px Inter, system-ui, sans-serif`;
    return ctx.measureText(text).width;
  };
}

interface Placed {
  el: HTMLElement;
  x: number;
  y: number;
}

export class GraphView {
  private svg: SVGSVGElement;
  private layer: HTMLElement;
  private live: HTMLElement;
  private placed = new Map<string, Placed>();
  private order: HTMLElement[] = [];
  private current: EgoLayout | null = null;
  private focusIndex = -1;
  private hidden: Record<string, boolean> = {};
  private measure = canvasMeasure();
  private reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  private size = { w: 0, h: 0 };

  constructor(
    private stage: HTMLElement,
    private g: Graph,
    private on: ViewHandlers
  ) {
    stage.textContent = "";
    this.svg = document.createElementNS(SVG, "svg");
    this.svg.setAttribute("class", "g-edges");
    this.svg.setAttribute("aria-hidden", "true");
    this.layer = document.createElement("div");
    this.layer.className = "g-nodes";
    this.live = document.createElement("p");
    this.live.className = "sr-only";
    this.live.setAttribute("aria-live", "polite");
    stage.append(this.svg, this.layer, this.live);

    this.layer.addEventListener("keydown", (e) => this.onKey(e));
    new ResizeObserver(() => {
      const { w, h } = this.box();
      if (this.focusIndex >= 0 && (Math.abs(w - this.size.w) > 1 || Math.abs(h - this.size.h) > 1)) this.render(false);
    }).observe(stage);
    // Labels are sized from the real fonts once they arrive
    document.fonts?.ready.then(() => this.focusIndex >= 0 && this.render(false));
  }

  get layoutNow() {
    return this.current;
  }

  setFocus(i: number, animate: boolean) {
    this.focusIndex = i;
    this.render(animate);
    const n = this.g.nodes[i];
    const parts = n.links.map((l) => `${l.items.length} ${l.field}`);
    this.live.textContent = `${n.name}, ${kindLabel(this.g, n.kind).toLowerCase()}. ${parts.join(", ") || "Nothing linked yet"}.`;
  }

  setHidden(hidden: Record<string, boolean>) {
    this.hidden = hidden;
    if (this.focusIndex >= 0) this.render(true);
  }

  // Lights a record's lines and its node
  highlight(i: number | null) {
    this.svg.querySelectorAll<SVGGElement>("g.g-lines g.e").forEach((e) => {
      const lit = i !== null && (e.dataset.a === String(i) || e.dataset.b === String(i));
      e.classList.toggle("lit", lit);
    });
    this.placed.forEach((p, key) => p.el.classList.toggle("is-hover", key === `n:${i}`));
  }

  // Puts keyboard focus on the record in the middle
  focusCentre() {
    this.placed.get(`n:${this.focusIndex}`)?.el.focus({ preventScroll: true });
  }

  private box() {
    return { w: this.stage.clientWidth, h: this.stage.clientHeight };
  }

  private render(animate: boolean) {
    const box = this.box();
    if (!box.w || !box.h) return;
    this.size = box;
    const motion = animate && !this.reduced.matches && this.current !== null;
    const L = layout(this.g, this.focusIndex, box, { hidden: this.hidden, measure: this.measure });
    const prev = this.current;
    this.current = L;
    this.stage.dataset.mode = L.compact ? "compact" : "wide";

    // Where the new focus was, so new records can unfold from the middle
    const keep = new Set<string>();
    const order: HTMLElement[] = [];
    const enter = (el: HTMLElement, x: number, y: number) => {
      if (!motion) return;
      el.animate(
        [
          { transform: at(L.focus.x, L.focus.y) + " scale(.4)", opacity: 0 },
          { transform: at(x, y), opacity: 1 },
        ],
        { duration: MOVE_MS, easing: EASE, delay: 60 }
      );
    };

    // The focus, then the ring in clockwise order
    const focusEl = this.node(L.focus.i, true, L.focus.label, L.focus.size, "");
    order.push(this.place(`n:${L.focus.i}`, focusEl, L.focus.x, L.focus.y, motion, keep, enter));
    for (const s of L.slots) {
      if (s.type === "node") {
        const el = this.node(s.i, false, s.label!, s.size, s.note);
        order.push(this.place(`n:${s.i}`, el, s.x, s.y, motion, keep, enter));
      } else {
        order.push(this.place(`c:${s.field}`, this.chip(s), s.x, s.y, motion, keep, enter));
      }
    }

    // Records that left fade out where they were
    for (const [key, p] of this.placed) {
      if (keep.has(key)) continue;
      this.placed.delete(key);
      p.el.classList.add("leaving");
      p.el.tabIndex = -1;
      if (motion) {
        p.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards" }).finished.then(
          () => p.el.remove(),
          () => p.el.remove()
        );
      } else p.el.remove();
    }

    // One tab stop for the whole graph: the focus, or whatever had it before
    const active = document.activeElement as HTMLElement | null;
    const stay = order.find((el) => el === active);
    this.order = order;
    order.forEach((el) => (el.tabIndex = el === (stay ?? order[0]) ? 0 : -1));

    this.drawEdges(L, motion, prev);
  }

  // Creates or updates a record's element
  private node(i: number, isFocus: boolean, label: LabelPlace, size: number, note: string): HTMLElement {
    const n = this.g.nodes[i];
    const key = `n:${i}`;
    let el = this.placed.get(key)?.el as HTMLAnchorElement | undefined;
    if (!el) {
      el = document.createElement("a");
      el.className = "g-node";
      el.dataset.i = String(i);
      const halo = document.createElement("span");
      halo.className = "g-halo";
      halo.setAttribute("aria-hidden", "true");
      const text = document.createElement("span");
      text.className = "g-label";
      text.setAttribute("aria-hidden", "true");
      el.append(halo, glyph(n.kind, size), text);
      el.addEventListener("click", (e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        if (Number(el!.dataset.i) !== this.focusIndex) this.on.go(i, e.detail === 0);
      });
      el.addEventListener("mouseenter", () => this.on.hover(i));
      el.addEventListener("mouseleave", () => this.on.hover(null));
      el.addEventListener("focus", () => this.on.hover(i));
      el.addEventListener("blur", () => this.on.hover(null));
    }
    el.href = this.on.href(i);
    el.classList.toggle("is-focus", isFocus);
    el.classList.remove("leaving");
    const extra = note && note !== "primary" && note !== "secondary" ? ` (${note})` : "";
    el.setAttribute("aria-label", `${kindLabel(this.g, n.kind)}: ${n.name}${extra}${isFocus ? ", in the middle" : ""}`);
    el.title = n.name;
    const g = el.querySelector<HTMLElement>(".glyph")!;
    const old = parseFloat(g.style.getPropertyValue("--s")) || size;
    g.style.setProperty("--s", size + "px");
    if (old !== size && !this.reduced.matches) {
      g.animate([{ transform: `scale(${old / size})` }, { transform: "scale(1)" }], { duration: MOVE_MS, easing: EASE });
    }
    const text = el.querySelector<HTMLElement>(".g-label")!;
    text.textContent = label.text;
    text.style.transform = labelTransform(label);
    return el;
  }

  private chip(s: Slot): HTMLElement {
    const key = `c:${s.field}`;
    let el = this.placed.get(key)?.el as HTMLButtonElement | undefined;
    if (!el) {
      el = document.createElement("button");
      el.type = "button";
      el.className = "g-chip";
      el.addEventListener("click", () => this.on.expand(s.field));
    }
    el.textContent = "";
    el.append(glyph(s.kind, 10), s.chipText);
    el.style.setProperty("--c", theme(s.kind).color);
    el.setAttribute("aria-label", `${s.more} more ${s.field}: list them in the panel`);
    return el;
  }

  // Puts an element at (x, y), gliding from where it was
  private place(
    key: string,
    el: HTMLElement,
    x: number,
    y: number,
    motion: boolean,
    keep: Set<string>,
    enter: (el: HTMLElement, x: number, y: number) => void
  ): HTMLElement {
    keep.add(key);
    const was = this.placed.get(key);
    el.style.transform = at(x, y);
    if (!was) {
      this.layer.append(el);
      enter(el, x, y);
    } else if (motion && (Math.abs(was.x - x) > 0.5 || Math.abs(was.y - y) > 0.5)) {
      el.getAnimations().forEach((a) => a.cancel());
      el.animate([{ transform: at(was.x, was.y) }, { transform: at(x, y) }], { duration: MOVE_MS, easing: EASE });
    }
    this.placed.set(key, { el, x, y });
    return el;
  }

  private drawEdges(L: EgoLayout, motion: boolean, prev: EgoLayout | null) {
    this.svg.setAttribute("viewBox", `0 0 ${L.w} ${L.h}`);
    // Every current group, not just the first: one from a move a moment ago
    // can still be here, and a group that's fading out is renamed so it's
    // never picked up twice
    const old = [...this.svg.querySelectorAll<SVGGElement>("g.g-lines")];
    const lines = document.createElementNS(SVG, "g");
    lines.setAttribute("class", "g-lines");
    for (const e of L.edges) {
      const grp = document.createElementNS(SVG, "g");
      grp.setAttribute("class", `e e-${e.family} ${e.focus ? "e-focus" : "e-cross"}`);
      grp.dataset.a = String(e.a);
      grp.dataset.b = String(e.b);
      // "is a" is a double line: a wide stroke with a narrow gap down the middle
      for (const part of e.family === "isa" ? ["o", "i"] : ["o"]) {
        const p = document.createElementNS(SVG, "path");
        p.setAttribute("d", e.d);
        p.setAttribute("class", part);
        grp.append(p);
      }
      lines.append(grp);
    }
    for (const group of old) {
      group.setAttribute("class", "g-lines-leaving");
      if (motion) {
        group.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: "forwards" }).finished.then(
          () => group.remove(),
          () => group.remove()
        );
      } else group.remove();
    }
    this.svg.append(lines);
    if (motion && prev) {
      // The new lines draw outward from the new focus once the records have moved
      const r = Math.hypot(L.w, L.h);
      const c = `${L.focus.x.toFixed(0)}px ${L.focus.y.toFixed(0)}px`;
      lines.animate(
        [{ clipPath: `circle(0px at ${c})` }, { clipPath: `circle(${r.toFixed(0)}px at ${c})` }],
        { duration: 520, delay: 200, easing: "ease-out", fill: "backwards" }
      );
    }
  }

  // Arrow keys walk the ring in clockwise order; Enter follows a link
  private onKey(e: KeyboardEvent) {
    const i = this.order.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % this.order.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + this.order.length) % this.order.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = this.order.length - 1;
    if (next < 0) return;
    e.preventDefault();
    this.order.forEach((el, k) => (el.tabIndex = k === next ? 0 : -1));
    this.order[next].focus();
  }
}
