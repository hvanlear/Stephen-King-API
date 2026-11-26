import { Graph, kindLabel, search } from "./model";
import { glyph } from "./theme";

// A combobox over every record's name (ARIA 1.2 pattern): type, arrow through
// the matches, Enter to go there, Escape to clear.
export function mountSearch(input: HTMLInputElement, list: HTMLUListElement, g: Graph, go: (i: number) => void) {
  let results: number[] = [];
  let active = 0;

  const close = () => {
    results = [];
    list.hidden = true;
    list.textContent = "";
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  };

  const pick = (i: number) => {
    input.value = "";
    close();
    go(i);
  };

  const render = () => {
    list.textContent = "";
    if (!results.length) return close();
    results.forEach((i, k) => {
      const n = g.nodes[i];
      const li = document.createElement("li");
      li.id = `g-opt-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(k === active));
      const name = document.createElement("span");
      name.className = "g-opt-name";
      name.textContent = n.name;
      const kind = document.createElement("span");
      kind.className = "g-opt-kind";
      kind.textContent = kindLabel(g, n.kind);
      li.append(glyph(n.kind, 10), name, kind);
      // Keeps focus in the box, so the click lands before the blur closes the list
      li.addEventListener("mousedown", (e) => e.preventDefault());
      li.addEventListener("click", () => pick(i));
      list.append(li);
    });
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-activedescendant", `g-opt-${results[active]}`);
  };

  input.addEventListener("input", () => {
    results = search(g, input.value);
    active = 0;
    render();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = "";
      close();
      return;
    }
    if (!results.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
      render();
      list.children[active]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[active]);
    }
  });
  input.addEventListener("blur", () => setTimeout(close, 0));
}
