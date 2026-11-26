import crypto from "crypto";
import { kinds } from "../kinds";
import { schema } from "./schema";
import { linkNote, refIndex, statusOf, type GraphPayload, type PayloadNode, type Ref, type Status } from "./payload";

// The graph file is built once at startup by walking the API's own responses,
// so it can't drift from them. It knows no kinds or fields: any { name or
// title, url } object in a response, or a list of them, is a link. One with a
// null url names someone with no record yet. An object that isn't a link,
// such as a villain's death, is read the same way one level down.

type Response = Record<string, unknown>;

// Keyed by route. A record the schema draws as another kind is left out
// here, so it's drawn once, under the route links to it use.
const sources: Record<string, Response[]> = Object.fromEntries(
  kinds.map((kind) => {
    const drawnAs = schema.kinds[kind.one]?.drawnAs;
    const responses = kind.records.map((record) => kind.response(record) as Response);
    return [kind.one, drawnAs ? responses.filter((response) => response[drawnAs.field] !== true) : responses];
  })
);

interface ApiLink {
  url: string | null;
  [key: string]: unknown;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// A link to a record, or a name whose url is null until it has one
const isLink = (value: unknown): value is ApiLink =>
  isObject(value) &&
  (typeof value.url === "string"
    ? value.url.includes("/api/")
    : value.url === null && typeof value.name === "string");

// "https://host/api/villain/57" → "villain/57"
const linkKey = (url: string) => url.slice(url.indexOf("/api/") + 5);

export interface PanelItem {
  // The record's position in the graph file, as the client's rows carry it,
  // or -1 for a name with no record yet, which has no kind or id either
  i: number;
  name: string;
  kind: string | null;
  id: number | null;
  note: string;
  status: Status | null;
  // A group's members, as rows of their own
  members: PanelItem[];
}

export interface PanelField {
  field: string;
  rollup: boolean;
  // Set for text, such as a death's cause, which has no items
  text: string | null;
  items: PanelItem[];
}

export interface Panel {
  kind: string;
  label: string;
  name: string;
  id: number;
  path: string;
  status: Status | null;
  fields: PanelField[];
}

export function buildGraph() {
  const records: { kind: string; response: Response }[] = [];
  for (const [kind, responses] of Object.entries(sources)) {
    for (const response of responses) records.push({ kind, response });
  }
  const index = new Map(
    records.map((r, i) => [`${r.kind}/${r.response.id}`, i] as [string, number])
  );

  const toRef = (link: ApiLink): Ref => {
    // A group's members, linked or not
    const members = Array.isArray(link.members) && link.members.every(isLink) ? { members: link.members.map(toRef) } : {};
    if (link.url === null) return { name: String(link.name), ...members };
    const i = index.get(linkKey(link.url));
    if (i === undefined) throw new Error(`Graph: unresolved link ${link.url}`);
    // Anything beyond the name and URL (a role or relationship) rides along.
    // A null one, such as a role not recorded yet, says nothing, so it's left
    // out to keep the file small.
    const attrs = Object.entries(link).filter(
      ([key, value]) => !["name", "title", "url"].includes(key) && ["string", "number", "boolean"].includes(typeof value)
    );
    return attrs.length || "members" in members ? { i, ...Object.fromEntries(attrs), ...members } : i;
  };

  const nodes: PayloadNode[] = records.map(({ kind, response }) => {
    const fields: Record<string, Ref | Ref[] | string> = {};
    const read = (object: Record<string, unknown>, path: string) => {
      for (const [field, value] of Object.entries(object)) {
        if (Array.isArray(value) && value.length && value.every(isLink)) {
          fields[path + field] = value.map(toRef);
        } else if (isLink(value)) {
          fields[path + field] = toRef(value);
        } else if (path && typeof value === "string") {
          fields[path + field] = value;
        } else if (!path && isObject(value)) {
          read(value, field + ".");
        }
      }
    };
    read(response, "");
    const name = String(response.Title ?? response.title ?? response.name);
    const statusField = schema.kinds[kind]?.status?.field;
    const status = statusField ? response[statusField] : undefined;
    return typeof status === "string"
      ? [kind, Number(response.id), name, fields, { status }]
      : [kind, Number(response.id), name, fields];
  });

  const payload: GraphPayload = { v: 1, schema, nodes };
  const json = JSON.stringify(payload);
  const hash = crypto.createHash("sha256").update(json).digest("hex").slice(0, 12);

  const find = (kind: string, id: number) => index.get(`${kind}/${id}`);
  const statusAt = (i: number) => statusOf(schema.kinds[nodes[i][0]], nodes[i][4]?.status);

  // The side panel for one record, rendered on the server so the page works
  // before (and without) the script
  const item = (r: Ref): PanelItem => {
    const i = refIndex(r);
    const members = typeof r === "object" && r.members ? r.members.map(item) : [];
    if (i < 0) return { i, name: (r as { name: string }).name, kind: null, id: null, note: "", status: null, members };
    const [kind, id, name] = nodes[i];
    return { i, name, kind, id, note: linkNote(r), status: statusAt(i), members };
  };
  const panel = (i: number): Panel => {
    const [kind, id, name, fields] = nodes[i];
    return {
      kind,
      label: schema.kinds[kind]?.label ?? kind,
      name,
      id,
      path: `/api/${kind}/${id}`,
      status: statusAt(i),
      fields: Object.entries(fields).map(([field, value]) => ({
        field,
        rollup: !!schema.fields[`${kind}.${field}`]?.rollup,
        text: typeof value === "string" ? value : null,
        items: typeof value === "string" ? [] : (Array.isArray(value) ? value : [value]).map(item),
      })),
    };
  };

  return { payload, json, hash, path: `/assets/graph-${hash}.json`, find, panel };
}

export const graph = buildGraph();
