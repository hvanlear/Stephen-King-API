import { linkNote, refIndex, statusOf, type GraphPayload, type KindInfo, type Ref, type Status } from "../graph/payload";

// The graph file decoded into records with their links. No DOM, so node:test
// can run it.

export interface Item {
  // The linked record's index, or -1 for a name with no record yet
  i: number;
  // A link attribute worth showing, such as a role or relationship
  note: string;
  // Only for a name with no record yet; a record has its own
  name?: string;
  // A group's members, such as the Losers' Club's
  members: Item[];
}

export interface Link {
  field: string;
  single: boolean;
  items: Item[];
  family: string;
  rollup: boolean;
}

// Text inside an object that isn't a link, such as a death's cause
export interface Text {
  field: string;
  text: string;
}

export interface GraphNode {
  index: number;
  kind: string;
  id: number;
  name: string;
  // "villain-57", as used in ?focus=
  key: string;
  links: Link[];
  // The links and text together, in response order, for the panel
  fields: (Link | Text)[];
  // Linked records that get a line, with the line's family
  drawn: Map<number, string>;
  // The note on a line, if its link has one: a character's role in a book
  notes: Map<number, string>;
  weight: number;
  // Its status mark (a villain's alive or deceased), if its kind has one
  status: Status | null;
  folded: string;
}

export interface Graph {
  nodes: GraphNode[];
  kinds: Record<string, KindInfo>;
  // Kinds in display order: the schema's, then any it doesn't list
  kindOrder: string[];
  counts: Record<string, number>;
  // Records with at least one line, for Surprise me
  linked: number[];
  byKey: Map<string, number>;
}

// Lower case, without accents or apostrophes, so "salems" finds Salem’s Lot
export const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘'`]/g, "")
    .toLowerCase();

export const nodeKey = (kind: string, id: number) => `${kind}-${id}`;

export const isText = (field: Link | Text): field is Text => "text" in field;

// The records a field links to, a group's members included. Names with no
// record yet are left out, since there's nothing to draw a line to.
export const linkedItems = (link: Link): Item[] =>
  link.items.flatMap(function each(e): Item[] {
    return [...(e.i >= 0 ? [e] : []), ...e.members.flatMap(each)];
  });

const toItem = (ref: Ref): Item => ({
  i: refIndex(ref),
  note: linkNote(ref),
  ...(typeof ref === "object" && !("i" in ref) ? { name: ref.name } : {}),
  members: typeof ref === "object" && ref.members ? ref.members.map(toItem) : [],
});

export function decode(payload: GraphPayload): Graph {
  const { kinds, fields } = payload.schema;
  const nodes: GraphNode[] = payload.nodes.map(([kind, id, name, raw, extra], index) => {
    const all = Object.entries(raw).map(([field, value]): Link | Text => {
      if (typeof value === "string") return { field, text: value };
      const single = !Array.isArray(value);
      const info = fields[`${kind}.${field}`];
      return {
        field,
        single,
        items: (single ? [value] : value).map(toItem),
        // A field the schema doesn't know yet still draws, as "appears in"
        family: info?.family ?? "appears",
        rollup: !!info?.rollup,
      };
    });
    return {
      index,
      kind,
      id,
      name,
      key: nodeKey(kind, id),
      links: all.filter((f): f is Link => !isText(f)),
      fields: all,
      drawn: new Map(),
      notes: new Map(),
      weight: extra?.weight ?? 0,
      status: statusOf(kinds[kind], extra?.status),
      folded: fold(name),
    };
  });

  // A line is drawn when both records list each other, or for a one-way link
  // outside a roll-up field. Roll-up entries are listed in the panel only.
  const lists = nodes.map((n) => new Set(n.links.flatMap((l) => linkedItems(l).map((e) => e.i))));
  for (const n of nodes) {
    for (const link of n.links) {
      for (const { i, note } of linkedItems(link)) {
        if ((lists[i].has(n.index) || !link.rollup) && !n.drawn.has(i)) n.drawn.set(i, link.family);
        if (note && !n.notes.has(i)) n.notes.set(i, note);
      }
    }
    // Importance: a weight from the data wins, else the number of lines
    if (!n.weight) n.weight = n.drawn.size;
  }

  const counts: Record<string, number> = {};
  for (const n of nodes) counts[n.kind] = (counts[n.kind] ?? 0) + 1;
  const kindOrder = [
    ...Object.keys(kinds).filter((k) => counts[k]),
    ...Object.keys(counts).filter((k) => !kinds[k]),
  ];

  return {
    nodes,
    kinds,
    kindOrder,
    counts,
    linked: nodes.filter((n) => n.drawn.size > 0).map((n) => n.index),
    byKey: new Map(nodes.map((n) => [n.key, n.index])),
  };
}

export const kindLabel = (g: Graph, kind: string) => g.kinds[kind]?.label ?? kind;

// Matches the starts of words, in any order: "flagg", "dark tower", "salems"
export function search(g: Graph, query: string, limit = 8): number[] {
  const q = fold(query.trim());
  if (!q) return [];
  const words = q.split(/\s+/);
  const hits: number[] = [];
  for (const n of g.nodes) {
    const hay = " " + n.folded.replace(/[(\-/:,.]/g, " ");
    if (words.every((w) => hay.includes(" " + w))) hits.push(n.index);
  }
  const N = g.nodes;
  hits.sort(
    (a, b) =>
      Number(N[b].folded.startsWith(q)) - Number(N[a].folded.startsWith(q)) ||
      N[b].weight - N[a].weight ||
      a - b
  );
  return hits.slice(0, limit);
}
