import zlib from "zlib";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, TestServer } from "./server";
import { graph } from "../src/graph/build";
import { schema } from "../src/graph/schema";
import { PANEL_ROWS, refIndex, statusOf, type Ref } from "../src/graph/payload";
import { decode } from "../src/client/model";
import { layout } from "../src/client/layout";

// The graph file behind the /next home page (SK-045), and the page itself

let server: TestServer;
before(async () => {
  server = await startServer();
});
after(() => server.close());

const { nodes } = graph.payload;
const isObject = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null && !Array.isArray(v);
// A link, or a name whose url is null until it has a record
const isLink = (v: unknown) => isObject(v) && (typeof v.url === "string" || (v.url === null && typeof v.name === "string"));

// A link as a path, or a name with no record yet in quotes, with its role
// if it has one, and a group's members after it:
// '/api/book/19 (antagonist)', '"The Losers' Club" ["Bill Denbrough", ...]'
const members = (list: unknown[] | undefined, describe: (m: any) => string) =>
  list ? ` [${list.map(describe).join(", ")}]` : "";
const role = (value: unknown) => (typeof value === "string" ? ` (${value})` : "");
const fromLink = (l: any): string =>
  (l.url === null ? JSON.stringify(l.name) : new URL(l.url).pathname) + role(l.role) + members(l.members, fromLink);
const fromRef = (r: Ref): string => {
  const i = refIndex(r);
  const base = i < 0 ? JSON.stringify((r as { name: string }).name) : `/api/${nodes[i][0]}/${nodes[i][1]}`;
  return base + role(typeof r === "object" && "i" in r ? r.role : undefined) + members(typeof r === "object" ? r.members : undefined, fromRef);
};

describe("the graph file", () => {
  it("has every record, once", async () => {
    for (const kind of Object.keys(schema.kinds)) {
      const { plural, drawnAs } = schema.kinds[kind];
      const res = await fetch(`${server.url}/api/${plural}`);
      const body: any = await res.json();
      // A villain is listed among the characters too, but drawn as a villain
      const elsewhere = (r: any) => drawnAs !== undefined && r[drawnAs.field] === true;
      const ids = nodes.filter((n) => n[0] === kind).map((n) => n[1]);
      assert.deepEqual(ids, body.data.filter((r: any) => !elsewhere(r)).map((r: { id: number }) => r.id), kind);
      for (const r of body.data.filter(elsewhere)) {
        assert.ok(nodes.some((n) => n[0] === drawnAs!.kind && n[1] === r.id), `${kind} ${r.id} isn't drawn as a ${drawnAs!.kind}`);
      }
    }
  });

  it("links exactly what each response links", async () => {
    for (const [kind, id, name, fields, extra] of nodes) {
      const res = await fetch(`${server.url}/api/${kind}/${id}`);
      const { data }: any = await res.json();
      assert.equal(name, data.Title ?? data.title ?? data.name);
      const statusField = schema.kinds[kind].status?.field;
      assert.equal(extra?.status, statusField ? data[statusField] : undefined, `${kind} ${id} status`);
      // Links, and one level into an object that isn't a link, such as a
      // villain's death, where text comes along too
      const fromApi: Record<string, string | string[]> = {};
      const read = (object: Record<string, unknown>, path: string) => {
        for (const [field, value] of Object.entries(object)) {
          const links = Array.isArray(value) ? value : [value];
          if (links.length && links.every(isLink)) fromApi[path + field] = links.map(fromLink);
          else if (path && typeof value === "string") fromApi[path + field] = value;
          else if (!path && isObject(value)) read(value, field + ".");
        }
      };
      read(data, "");
      const fromGraph: Record<string, string | string[]> = {};
      for (const [field, value] of Object.entries(fields)) {
        fromGraph[field] = typeof value === "string" ? value : (Array.isArray(value) ? value : [value]).map(fromRef);
      }
      assert.deepEqual(fromGraph, fromApi, `${kind} ${id}`);
    }
  });

  it("names a kind drawn partly as another for what it draws", () => {
    // Its filter counts only what's drawn as it, so the counts row's noun
    // ("214 characters") would disagree with it ("characters 13")
    for (const [kind, info] of Object.entries(schema.kinds)) {
      if (info.drawnAs) assert.ok(info.filter && info.filter !== info.noun, `give the ${kind} kind a filter name`);
    }
    assert.equal(schema.kinds.character.filter, "other characters");
  });

  it("describes every kind and link field it uses", () => {
    for (const [kind, , , fields] of nodes) {
      assert.ok(schema.kinds[kind], `add the ${kind} kind to src/graph/schema.ts`);
      for (const [field, value] of Object.entries(fields)) {
        if (typeof value === "string") continue;
        assert.ok(schema.fields[`${kind}.${field}`], `add ${kind}.${field} to src/graph/schema.ts`);
      }
    }
  });

  it("draws a line between a killer and its victim, from either end", () => {
    const g = decode(graph.payload);
    const it = g.byKey.get("villain-57")!;
    const victor = g.byKey.get("villain-18")!;
    assert.equal(g.nodes[it].drawn.get(victor), "killed");
    assert.equal(g.nodes[victor].drawn.get(it), "killed");
    // Ben Mears and Mark Petrie, who aren't villains, killed Barlow, who
    // killed Straker and Jimmy Cody
    const barlow = g.byKey.get("villain-2")!;
    const ben = g.byKey.get("character-202")!;
    const killed = [...g.nodes[barlow].drawn].filter(([, family]) => family === "killed").map(([i]) => i);
    const expected = ["character-202", "character-203", "villain-98", "character-214"].map((key) => g.byKey.get(key)!);
    assert.deepEqual(killed.sort((a, b) => a - b), expected.sort((a, b) => a - b));
    assert.equal(g.nodes[ben].drawn.get(barlow), "killed");
  });

  it("keeps a character's role in a book, and draws a cameo's line faint", () => {
    const g = decode(graph.payload);
    const it = g.byKey.get("villain-57")!;
    const books = g.nodes[it].links.find((l) => l.field === "books")!;
    assert.deepEqual(
      books.items.map((e) => [g.nodes[e.i].name, e.note]),
      [["It", "antagonist"], ["The Tommyknockers", "minor"]]
    );
    // A role that isn't recorded yet is left out of the file
    const jack = graph.payload.nodes[g.byKey.get("villain-106")!][3];
    assert.ok((jack.books as Ref[]).every((ref) => typeof ref === "number"));
    // It's line to The Tommyknockers is a cameo's, and so is the book's to It
    const tommyknockers = g.nodes.find((n) => n.name === "The Tommyknockers")!.index;
    for (const [focus, other] of [[it, tommyknockers], [tommyknockers, it]]) {
      const edge = layout(g, focus, { w: 868, h: 543 }).edges.find((e) => e.focus && e.b === other)!;
      assert.equal(edge.note, "minor");
    }
    // Butch Bowers dies in It, where he's minor: his death's link to the book
    // has no role, but the line still takes the one on his books link
    const butch = g.byKey.get("villain-8")!;
    const itBook = g.nodes.find((n) => n.kind === "book" && n.name === "It")!.index;
    const line = layout(g, butch, { w: 868, h: 543 }).edges.find((e) => e.focus && e.b === itBook)!;
    assert.equal(line.note, "minor");
    assert.equal(g.notes[line.note]?.faint, true);
  });

  it("has a mark for every status a record has", () => {
    for (const [kind, , , , extra] of nodes) {
      if (extra?.status === undefined) continue;
      assert.ok(
        statusOf(schema.kinds[kind], extra.status),
        `add "${extra.status}" to ${kind}'s status marks in src/graph/schema.ts`
      );
    }
  });

  it("stays within its budget", () => {
    // Past 40 KB, switch to names plus neighbourhoods (SK-045)
    const size = zlib.brotliCompressSync(graph.json).length;
    assert.ok(size <= 40 * 1024, `${size} bytes brotli`);
  });

  it("is served with its hash in the name and cached for good", async () => {
    const res = await fetch(server.url + graph.path);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    assert.equal(res.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.deepEqual(await res.json(), graph.payload);
  });

  it("isn't served under an old hash", async () => {
    const res = await fetch(`${server.url}/assets/graph-000000000000.json`);
    assert.equal(res.status, 404);
  });

  it("isn't counted as an API hit", async () => {
    // It's outside /api, so the rate limiter doesn't see it either
    const res = await fetch(server.url + graph.path);
    assert.equal(res.headers.get("ratelimit"), null);
  });
});

describe("GET /next", () => {
  const page = async (query = "") => {
    const res = await fetch(`${server.url}/next${query}`);
    return { status: res.status, html: await res.text() };
  };
  const config = (html: string) =>
    JSON.parse(/<script type="application\/json" id="graph-config">([^<]*)<\/script>/.exec(html)![1]);

  it("renders the default record and stays out of search results", async () => {
    const { status, html } = await page();
    assert.equal(status, 200);
    assert.match(html, /<meta name="robots" content="noindex" \/>/);
    assert.match(html, /<title>Stephen King API<\/title>/);
    const focus = graph.panel(graph.find("villain", 57)!);
    assert.ok(html.includes(`<h2 class="g-name" tabindex="-1">${focus.name}</h2>`));
    assert.deepEqual(config(html), {
      graph: graph.path,
      focus: "villain-57",
      api: "https://stephen-king-api.onrender.com",
    });
  });

  it("renders the record named by ?focus, with links that work without the script", async () => {
    const { html } = await page("?focus=book-19");
    const panel = graph.panel(graph.find("book", 19)!);
    assert.ok(html.includes(`<title>${panel.name} · Stephen King API</title>`));
    assert.equal(config(html).focus, "book-19");
    assert.ok(html.includes(`href="https://stephen-king-api.onrender.com/api/book/19"`));
    for (const f of panel.fields) {
      assert.ok(html.includes(`data-field="${f.field}"`), f.field);
      for (const item of f.items.filter((e) => e.i >= 0)) {
        assert.ok(html.includes(`href="/next?focus=${item.kind}-${item.id}"`), `${f.field} ${item.name}`);
      }
    }
  });

  it("falls back to the default for an unknown or malformed focus", async () => {
    for (const query of ["?focus=book-99999", "?focus=nope", "?focus=<script>", "?focus=book-1&focus=book-2"]) {
      const { status, html } = await page(query);
      assert.equal(status, 200, query);
      assert.equal(config(html).focus, "villain-57", query);
    }
  });

  it("shows a long field's first links and puts the rest behind Show all, as the script does", async () => {
    const { html } = await page("?focus=book-19");
    const panel = graph.panel(graph.find("book", 19)!);
    const villains = panel.fields.find((f) => f.field === "villains")!;
    assert.ok(villains.items.length > PANEL_ROWS);
    const section = /<section class="g-field" data-field="villains">([^]*?)<\/section>/.exec(html)![1];
    const [shown, rest] = section.split('<details class="g-all">');
    const ids = (part: string) => [...part.matchAll(/data-i="(\d+)"/g)].map((m) => Number(m[1]));
    assert.deepEqual(ids(shown), villains.items.slice(0, PANEL_ROWS).map((item) => item.i));
    assert.deepEqual(ids(rest), villains.items.slice(PANEL_ROWS).map((item) => item.i));
    assert.ok(rest.includes(`Show all ${villains.items.length}`));
  });

  it("shows a record's status, and the status of the records it links to", async () => {
    const { html } = await page("?focus=villain-57");
    const focus = graph.panel(graph.find("villain", 57)!);
    assert.ok(focus.status);
    assert.ok(
      html.includes(`<span class="g-status"><span class="g-mark" aria-hidden="true">${focus.status.mark}</span> ${focus.status.value}</span>`)
    );
    const { html: book } = await page("?focus=book-19");
    const panel = graph.panel(graph.find("book", 19)!);
    for (const item of panel.fields.find((f) => f.field === "villains")!.items) {
      assert.ok(item.status, item.name);
      assert.ok(
        book.includes(
          `<span class="g-row-text">${item.name}</span><span class="g-mark" aria-hidden="true">${item.status.mark}</span><span class="sr-only">, ${item.status.label}</span>`
        ),
        item.name
      );
    }
    // The key explains both marks
    for (const m of Object.values(schema.kinds.villain.status!.marks)) {
      assert.ok(html.includes(`<span class="g-mark" aria-hidden="true">${m.mark}</span>${m.label}</span>`), m.label);
    }
  });

  it("shows how a villain died, with a killer who has no record as a plain row", async () => {
    const { html } = await page("?focus=villain-57");
    const section = (page: string, field: string) =>
      new RegExp(`<section class="g-field" data-field="${field.replace(".", "\\.")}">([^]*?)</section>`).exec(page)![1];
    assert.match(section(html, "death.cause"), /<p class="g-text">Heart crushed<\/p>/);
    assert.match(section(html, "death.work"), /href="\/next\?focus=book-19"/);
    // The Losers' Club has no record, so it's a plain row, and its members
    // link to theirs
    const killers = section(html, "death.killed_by");
    assert.match(
      killers,
      /^\s*<h3[^]*?<\/h3>\s*<ul class="g-rows">\s*<li>\s*<span class="g-row-plain">[^<]*<span class="glyph"[^>]*><\/span>\s*<span class="g-row-name"><span class="g-row-text">The Losers&#39; Club<\/span><\/span>\s*<span class="g-note">no record yet<\/span>\s*<\/span>\s*<ul class="g-rows g-members">/
    );
    const members: [string, number][] = [["Bill Denbrough", 207], ["Richie Tozier", 210], ["Beverly Marsh", 209], ["Eddie Kaspbrak", 211], ["Ben Hanscom", 208]];
    for (const [name, id] of members) {
      const row = new RegExp(`href="/next\\?focus=character-${id}" data-i="\\d+">\\s*<span class="glyph"[^>]*></span>\\s*<span class="g-row-name"><span class="g-row-text">${name}</span>`);
      assert.match(killers, row, name);
    }
    // It's victims, and a killer with a record, link both ways
    assert.match(section(html, "killed"), /href="\/next\?focus=villain-18"/);
    const { html: victor } = await page("?focus=villain-18");
    assert.match(section(victor, "death.killed_by"), /href="\/next\?focus=villain-57"/);
  });

  it("can't be broken out of by a name in the script config", async () => {
    const { html } = await page();
    const raw = /id="graph-config">([^]*?)<\/script>/.exec(html)![1];
    assert.ok(!raw.includes("<"));
  });

  it("counts every kind as its list route does", async () => {
    const { html } = await page();
    for (const kind of Object.keys(schema.kinds)) {
      // Characters count the villains too, though the graph draws them as villains
      const res = await fetch(`${server.url}/api/${schema.kinds[kind].plural}`);
      const count = ((await res.json()) as any).data.length;
      assert.ok(html.includes(`>${count}</b><span>${schema.kinds[kind].noun}</span>`), `${kind} ${count}`);
    }
  });
});
