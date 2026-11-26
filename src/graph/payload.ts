// The graph file the home page loads, shared by the server that builds it and
// the client that reads it. Types and one small helper, so the client bundle
// gets none of the server's code.

export type Family = "appears" | "setting" | "isa" | "inside" | "related";

export interface KindInfo {
  label: string;
  // The list route, /api/<plural>
  plural: string;
  // What the counts row calls them
  noun: string;
  // The record the endpoint grid links to
  example: number;
}

export interface FieldInfo {
  family: Family;
  rollup?: boolean;
}

export interface Schema {
  kinds: Record<string, KindInfo>;
  // Keyed "kind.field", such as "villain.residence"
  fields: Record<string, FieldInfo>;
}

// A link is the linked record's position in `nodes`. A link that carries more
// than a name and URL in the response (a future role or relationship) keeps
// those values: { i: 263, role: "primary" }.
export type LinkRef = number | { i: number; [attr: string]: string | number | boolean | null };

// The side panel shows this many links per field, and the rest behind
// "Show all". The server's first panel and the client's later ones share it.
export const PANEL_ROWS = 5;

// What the panel says beside a link: its role or relationship, if it has one
export const linkNote = (ref: LinkRef) => (typeof ref === "number" ? "" : String(ref.role ?? ref.relationship ?? ""));

// [kind, id, name, link fields, weight?]. Field names, their order and single
// versus list match the record's API response. Empty and null links are left out.
export type PayloadNode = [string, number, string, Record<string, LinkRef | LinkRef[]>, number?];

export interface GraphPayload {
  v: 1;
  schema: Schema;
  nodes: PayloadNode[];
}
