import { Request, Response } from "express";
import config from "../config";
import { graph } from "../graph/build";
import { schema } from "../graph/schema";
import { kindTheme } from "../graph/palette";
import { clientAssets } from "../utils/clientAssets";

// The graph home page, design 06. It's at /next until it replaces / (SK-045).
// ?focus=villain-57 picks the record in the middle; the server renders its
// panel, so the links work before the script loads, and without it.

const DEFAULT_FOCUS = graph.find("villain", 57) ?? 0;
const kindOrder = Object.keys(schema.kinds);

const kinds = kindOrder.map((kind) => {
  const info = schema.kinds[kind];
  const count = graph.payload.nodes.filter((n) => n[0] === kind).length;
  const example = graph.find(kind, info.example);
  return {
    kind,
    noun: info.noun,
    count,
    color: kindTheme(kind, kindOrder).text,
    list: `/api/${info.plural}`,
    one: `/api/${kind}/${info.example}`,
    exampleName: example === undefined ? "" : graph.payload.nodes[example][2],
  };
});

export function showGraphHome(req: Request, res: Response) {
  const raw = typeof req.query.focus === "string" ? req.query.focus : "";
  const match = /^([a-z]+)-(\d{1,7})$/.exec(raw);
  const found = match ? graph.find(match[1], Number(match[2])) : undefined;
  // An unknown focus falls back to the default rather than erroring
  const focus = found ?? DEFAULT_FOCUS;
  const panel = graph.panel(focus);
  const assets = clientAssets();

  res.render("graph-home", {
    title: found === undefined ? "Stephen King API" : `${panel.name} · Stephen King API`,
    description:
      found === undefined
        ? "A free REST API of Stephen King's books, short stories, villains and the places they haunt. Walk the graph of how they connect."
        : `${panel.label} ${panel.name} in the Stephen King API, with every book, story, villain and place it links to.`,
    kinds,
    panel,
    theme: (kind: string) => kindTheme(kind, kindOrder),
    href: (kind: string, id: number) => `${req.path}?focus=${kind}-${id}`,
    api: config.url,
    assets,
    // Read by the script; < is escaped so a name can't close the script tag
    clientConfig: JSON.stringify({ graph: graph.path, focus: `${panel.kind}-${panel.id}`, api: config.url }).replace(
      /</g,
      "\\u003c"
    ),
  });
}
