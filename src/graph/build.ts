import crypto from "crypto";
import { kinds } from "../kinds";
import { schema } from "./schema";
import { linkNote, statusOf, type GraphPayload, type LinkRef, type PayloadNode, type Status } from "./payload";

// The graph file is built once at startup by walking the API's own responses,
// so it can't drift from them. It knows no kinds or fields: any { name or
// title, url } object in a response, or a list of them, is a link.

type Response = Record<string, unknown>;

// Keyed by route, in the schema's order
const sources: Record<string, Response[]> = Object.fromEntries(
  kinds.map((kind) => [kind.one, kind.records.map((record) => kind.response(record) as Response)])
);

interface ApiLink {
  url: string;
  [key: string]: unknown;
}

const isLink = (value: unknown): value is ApiLink =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as ApiLink).url === "string" &&
  (value as ApiLink).url.includes("/api/");

// "https://host/api/villain/57" → "villain/57"
const linkKey = (url: string) => url.slice(url.indexOf("/api/") + 5);

export interface PanelField {
  field: string;
  rollup: boolean;
  // i is the record's position in the graph file, as the client's rows carry it
  items: { i: number; name: string; kind: string; id: number; note: string; status: Status | null }[];
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

  const toRef = (link: ApiLink): LinkRef => {
    const i = index.get(linkKey(link.url));
    if (i === undefined) throw new Error(`Graph: unresolved link ${link.url}`);
    // Anything beyond the name and URL (a future role or relationship) rides along
    const attrs = Object.entries(link).filter(
      ([key, value]) =>
        !["name", "title", "url"].includes(key) &&
        (value === null || ["string", "number", "boolean"].includes(typeof value))
    );
    return attrs.length ? { i, ...Object.fromEntries(attrs) } : i;
  };

  const nodes: PayloadNode[] = records.map(({ kind, response }) => {
    const fields: Record<string, LinkRef | LinkRef[]> = {};
    for (const [field, value] of Object.entries(response)) {
      if (Array.isArray(value) && value.length && value.every(isLink)) {
        fields[field] = value.map(toRef);
      } else if (isLink(value)) {
        fields[field] = toRef(value);
      }
    }
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
  const panel = (i: number): Panel => {
    const [kind, id, name, fields] = nodes[i];
    const ref = (r: LinkRef) => (typeof r === "number" ? r : r.i);
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
        items: (Array.isArray(value) ? value : [value]).map((r) => {
          const [k, linkedId, linkedName] = nodes[ref(r)];
          return { i: ref(r), name: linkedName, kind: k, id: linkedId, note: linkNote(r), status: statusAt(ref(r)) };
        }),
      })),
    };
  };

  return { payload, json, hash, path: `/assets/graph-${hash}.json`, find, panel };
}

export const graph = buildGraph();
