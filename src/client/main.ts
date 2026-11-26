import type { GraphPayload } from "../graph/payload";
import { decode, Graph } from "./model";
import { GraphView } from "./view";
import { Panel } from "./panel";
import { mountSearch } from "./search";
import { glyph, setKindOrder } from "./theme";
import "./home.css";

// The graph explorer on the home page. The server renders the page and the
// first record's panel; this adds the graph, search, filters and moving
// between records without a reload. ?focus=villain-57 names the record in the
// middle, and Back and Forward walk the history.

interface Config {
  graph: string;
  focus: string;
  api: string;
}

const root = document.querySelector<HTMLElement>("[data-graph]");
const configEl = document.getElementById("graph-config");

if (root && configEl) {
  const config: Config = JSON.parse(configEl.textContent || "{}");
  const stage = root.querySelector<HTMLElement>(".g-stage")!;
  fetch(config.graph)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`The graph file returned ${r.status}`))))
    .then((payload: GraphPayload) => start(root, stage, decode(payload), config))
    .catch((error) => {
      // A failed fetch, or a bug in start() after the view has already
      // cleared the stage: either way, say so in a fresh message and keep
      // the real error in the console
      console.error(error);
      root.classList.remove("is-live");
      const message = document.createElement("p");
      message.className = "g-loading";
      message.textContent = "Couldn’t load the graph. The links in the panel still work.";
      stage.replaceChildren(message);
    });
}

function start(root: HTMLElement, stage: HTMLElement, g: Graph, config: Config) {
  setKindOrder(g.kindOrder);
  const panelEl = root.querySelector<HTMLElement>(".g-panel")!;
  let focus = g.byKey.get(config.focus) ?? g.byKey.get("villain-57") ?? 0;
  const hidden: Record<string, boolean> = {};

  const href = (i: number) => `${location.pathname}?focus=${g.nodes[i].key}`;
  const hover = (i: number | null) => {
    view.highlight(i);
    panel.highlight(i);
  };

  const show = (i: number, how: "push" | "pop" | "start", viaKeyboard = false) => {
    focus = i;
    const n = g.nodes[i];
    view.setFocus(i, how !== "start");
    panel.show(i);
    stage.setAttribute("aria-label", `Links of ${n.name}. Arrow keys move around the ring.`);
    document.title = `${n.name} · Stephen King API`;
    if (how === "push") history.pushState({ focus: n.key }, "", href(i));
    if (viaKeyboard) view.focusCentre();
  };
  const go = (i: number, viaKeyboard = false) => {
    if (i !== focus) show(i, "push", viaKeyboard);
  };

  const view = new GraphView(stage, g, {
    go,
    expand: (field) => panel.expand(field),
    hover,
    href,
  });
  const panel = new Panel(panelEl, g, { go: (i) => go(i), hover, href, api: config.api });

  // Kind filters: one switch per kind, with its count
  const filters = root.querySelector<HTMLElement>(".g-filters")!;
  const toggle = filters.querySelector<HTMLButtonElement>(".g-kinds-toggle")!;
  const summary = toggle.querySelector<HTMLElement>(".g-kinds-summary")!;
  const switches = g.kindOrder.map((kind) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "g-kind-btn";
    b.setAttribute("aria-pressed", "true");
    const count = document.createElement("span");
    count.className = "g-kind-count";
    count.textContent = String(g.counts[kind]);
    // The counts row's name for them ("short stories"), not the route's ("shorts")
    b.append(glyph(kind, 10), g.kinds[kind]?.noun ?? kind, count);
    b.addEventListener("click", () => {
      hidden[kind] = !hidden[kind];
      b.setAttribute("aria-pressed", String(!hidden[kind]));
      const on = g.kindOrder.filter((k) => !hidden[k]).length;
      summary.textContent = on === g.kindOrder.length ? "all" : `${on} of ${g.kindOrder.length}`;
      view.setHidden({ ...hidden });
    });
    return b;
  });
  filters.querySelector(".g-kind-list")!.append(...switches);
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    filters.toggleAttribute("data-open", open);
  });

  mountSearch(
    root.querySelector<HTMLInputElement>(".g-search input")!,
    root.querySelector<HTMLUListElement>(".g-search ul")!,
    g,
    (i) => go(i)
  );

  root.querySelector<HTMLButtonElement>(".g-surprise")!.addEventListener("click", () => {
    const pool = g.linked.filter((i) => i !== focus);
    go(pool[Math.floor(Math.random() * pool.length)]);
  });

  window.addEventListener("popstate", (e) => {
    const key = (e.state && e.state.focus) || new URLSearchParams(location.search).get("focus") || config.focus;
    const i = g.byKey.get(key);
    if (i !== undefined && i !== focus) show(i, "pop");
  });

  root.classList.add("is-live");
  history.replaceState({ focus: g.nodes[focus].key }, "", location.href);
  show(focus, "start");
}
