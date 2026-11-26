import { Graph, kindLabel } from "./model";
import { glyph, theme } from "./theme";

// The side panel: the record's API path and every link in its response,
// grouped by field in response order. The server renders the same markup for
// the first record (views/partials/graph-panel.ejs), so it works without the script.

export interface PanelHandlers {
  go(i: number): void;
  hover(i: number | null): void;
  href(i: number): string;
  api: string;
}

const ROW_LIMIT = 5;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class Panel {
  private expanded = new Set<string>();
  private index = -1;
  private json = new Map<string, string>();

  constructor(
    private root: HTMLElement,
    private g: Graph,
    private on: PanelHandlers
  ) {}

  show(i: number) {
    if (i !== this.index) this.expanded = new Set();
    this.index = i;
    this.render();
  }

  // Opens a field in full and brings it into view (a "+N" chip on the graph)
  expand(field: string) {
    this.expanded.add(field);
    this.render();
    const section = this.root.querySelector<HTMLElement>(`[data-field="${CSS.escape(field)}"]`);
    if (!section) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    section.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
    section.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
  }

  highlight(i: number | null) {
    this.root.querySelectorAll<HTMLElement>(".g-row").forEach((r) => r.classList.toggle("is-hover", r.dataset.i === String(i)));
  }

  private render() {
    const n = this.g.nodes[this.index];
    const t = theme(n.kind);
    const path = `/api/${n.kind}/${n.id}`;
    const root = this.root;
    root.textContent = "";

    const chip = el("span", "g-kind", kindLabel(this.g, n.kind));
    chip.style.setProperty("--c", t.color);
    chip.style.setProperty("--ink", t.ink);
    const name = el("h2", "g-name", n.name);
    const get = el("a", "g-get");
    get.href = this.on.api + path;
    get.append(el("span", "g-verb", "GET"), " " + path);
    root.append(chip, name, get, el("p", "g-eyebrow", "In the response"));

    if (!n.links.length) root.append(el("p", "g-empty", "Nothing linked yet."));

    const fields = el("div", "g-fields");
    for (const link of n.links) {
      const section = el("section", "g-field");
      section.dataset.field = link.field;
      const head = el("h3", "g-field-head");
      head.tabIndex = -1;
      const code = el("code", undefined, `"${link.field}"`);
      code.style.color = theme(this.g.nodes[link.items[0].i].kind).text;
      head.append(code, el("span", "g-count", String(link.items.length)));
      if (link.rollup) head.append(el("span", "g-hint", n.kind === "place" ? "includes places inside" : "includes kinds inside"));
      section.append(head);

      const open = this.expanded.has(link.field);
      const list = el("ul", "g-rows");
      for (const item of open ? link.items : link.items.slice(0, ROW_LIMIT)) {
        const target = this.g.nodes[item.i];
        const a = el("a", "g-row");
        a.href = this.on.href(item.i);
        a.dataset.i = String(item.i);
        a.append(glyph(target.kind, 10), el("span", "g-row-name", target.name), el("span", "g-note", item.note));
        const arrow = el("span", "g-arrow", "→");
        arrow.setAttribute("aria-hidden", "true");
        a.append(arrow);
        a.addEventListener("click", (e) => {
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          this.on.go(item.i);
        });
        a.addEventListener("mouseenter", () => this.on.hover(item.i));
        a.addEventListener("mouseleave", () => this.on.hover(null));
        const li = el("li");
        li.append(a);
        list.append(li);
      }
      section.append(list);
      if (!open && link.items.length > ROW_LIMIT) {
        const more = el("button", "g-more", `Show all ${link.items.length}`);
        more.type = "button";
        more.addEventListener("click", () => {
          this.expanded.add(link.field);
          this.render();
          this.root.querySelector<HTMLElement>(`[data-field="${CSS.escape(link.field)}"] li:nth-child(${ROW_LIMIT + 1}) a`)?.focus();
        });
        section.append(more);
      }
      fields.append(section);
    }
    root.append(fields);

    // The real response, fetched once when asked for
    const details = el("details", "g-json");
    const summary = el("summary", undefined, "Show the JSON");
    const pre = el("pre");
    details.append(summary, pre);
    details.addEventListener("toggle", () => {
      if (!details.open || pre.textContent) return;
      const cached = this.json.get(path);
      if (cached) {
        pre.textContent = cached;
        return;
      }
      pre.textContent = "Loading…";
      fetch(this.on.api + path)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((body) => {
          const text = JSON.stringify(body, null, 2);
          this.json.set(path, text);
          pre.textContent = text;
        })
        .catch(() => (pre.textContent = "Couldn’t load the response. The GET link above opens it."));
    });
    root.append(details, el("p", "g-foot", "Every link in a response is a full URL, so you can walk the universe one GET at a time."));
  }
}
