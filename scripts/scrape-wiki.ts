// Reads each villain's page on the Stephen King Wiki and reports what the
// wiki says that the catalog doesn't: appearances, mentions, residence and
// aliases. Run by hand with: npm run scrape-wiki
//
// It never changes catalog/. Everything goes to wiki-scrape/, which git ignores:
//   cache/         raw API responses, so re-runs don't ask the wiki again
//   report.md      what matched, what didn't, and the proposed changes
//   villains.json  everything extracted, per villain
//
// The wiki's text is CC BY-SA. Requests go through the MediaWiki API one at a
// time, with a pause between them and a User-Agent naming this project.
// Pass --refresh to ignore the cache and fetch again.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { books, shorts, villains, Villain } from "../src/catalog";

const API = "https://stephenking.fandom.com/api.php";
const WIKI = "https://stephenking.fandom.com/wiki/";
const USER_AGENT = "Stephen-King-API-scraper/0.1 (https://github.com/hvanlear/Stephen-King-API)";
const PAUSE_MS = 3000;
const TITLES_PER_REQUEST = 50; // the most the API accepts

const OUT_DIR = path.join(__dirname, "..", "wiki-scrape");
const CACHE_DIR = path.join(OUT_DIR, "cache");

// ---------------------------------------------------------------------------
// Wikitext parsing

const LINK = /\[\[([^[\]|#]+)(?:#[^[\]|]*)?(?:\|([^[\]]*))?\]\]/g;
const NAMESPACED = /^(category|file|image)\s*:/i;

export interface WikiLink {
  target: string;
  text: string;
  end: number; // index just past the link
}

export function links(wikitext: string): WikiLink[] {
  return Array.from(wikitext.matchAll(LINK), (match) => ({
    target: match[1].trim().replace(/_/g, " "),
    text: (match[2] ?? match[1]).trim(),
    end: (match.index ?? 0) + match[0].length,
  }));
}

// Wikitext down to the words a reader sees
export function plainText(wikitext: string): string {
  return wikitext
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(LINK, (_, target: string, text?: string) => text ?? target)
    .replace(/'{2,}/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Splits template text at its own pipes, not the ones inside links, nested
// templates, or tags like <gallery> and <tabber>
function splitParams(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let tag: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (tag) {
      if (text.slice(i, i + tag.length + 2).toLowerCase() === `</${tag}`) {
        tag = null;
      }
      continue;
    }
    const open = /^<(gallery|tabber|ref|nowiki|pre)\b[^>]*?(\/?)>/i.exec(text.slice(i, i + 200));
    if (open) {
      tag = open[2] ? null : open[1].toLowerCase();
      i += open[0].length - 1;
      continue;
    }
    const pair = text.slice(i, i + 2);
    if (pair === "{{" || pair === "[[") {
      depth++;
      i++;
    } else if ((pair === "}}" || pair === "]]") && depth > 0) {
      depth--;
      i++;
    } else if (text[i] === "|" && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

// Named parameters of the page's {{Character}} infobox, as raw wikitext
export function parseInfobox(wikitext: string): Record<string, string> | null {
  const start = wikitext.search(/\{\{\s*Character\s*(\||\n|\}\})/i);
  if (start === -1) {
    return null;
  }
  let depth = 0;
  let end = -1;
  for (let i = start; i < wikitext.length - 1; i++) {
    const pair = wikitext.slice(i, i + 2);
    if (pair === "{{") {
      depth++;
      i++;
    } else if (pair === "}}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
      i++;
    }
  }
  if (end === -1) {
    return null;
  }

  const fields: Record<string, string> = {};
  // The first part is the template's name
  for (const part of splitParams(wikitext.slice(start + 2, end)).slice(1)) {
    const equals = part.indexOf("=");
    if (equals !== -1) {
      fields[part.slice(0, equals).trim().toLowerCase()] = part.slice(equals + 1).trim();
    }
  }
  return fields;
}

// Links in the opening text, after the infobox and before the first heading,
// which usually names the character's work: "the main antagonist of [[Apt Pupil]]"
export function introLinks(wikitext: string): string[] {
  const infobox = wikitext.search(/\{\{\s*Character\s*(\||\n|\}\})/i);
  let start = 0;
  if (infobox !== -1) {
    let depth = 0;
    for (let i = infobox; i < wikitext.length - 1; i++) {
      const pair = wikitext.slice(i, i + 2);
      if (pair === "{{" || pair === "}}") {
        depth += pair === "{{" ? 1 : -1;
        i++;
        if (depth === 0) {
          start = i + 1;
          break;
        }
      }
    }
  }
  const rest = wikitext.slice(start);
  const heading = /^==.*==\s*$/m.exec(rest);
  return links(heading ? rest.slice(0, heading.index) : rest)
    .map((link) => link.target)
    .filter((target) => !NAMESPACED.test(target));
}

export function categories(wikitext: string): string[] {
  const found = Array.from(
    wikitext.matchAll(/\[\[\s*Category\s*:\s*([^\]|]+)/gi),
    (match) => match[1].trim()
  );
  return [...new Set(found)];
}

// "(mentioned)", "(indirectly referenced)" and the like
const MENTION = /mention|referenc/i;

export interface AppearanceLine {
  target: string; // the linked page
  note: string; // whatever follows the link, such as "(mentioned)"
  mentioned: boolean;
  heading: string | null; // the subsection it's under, such as "Film"
}

// The bulleted links in the page's "Appearances" section
export function parseAppearances(
  wikitext: string
): { lines: AppearanceLine[]; unparsed: string[] } | null {
  const heading = /^==\s*Appearances\b[^=\n]*==\s*$/im.exec(wikitext);
  if (!heading) {
    return null;
  }
  const rest = wikitext.slice(heading.index + heading[0].length);
  const next = /^==[^=].*==\s*$/m.exec(rest);
  const body = next ? rest.slice(0, next.index) : rest;

  const lines: AppearanceLine[] = [];
  const unparsed: string[] = [];
  let subheading: string | null = null;
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    const sub = /^===+\s*(.*?)\s*===+$/.exec(line);
    if (sub) {
      subheading = sub[1];
      continue;
    }
    if (!line.startsWith("*")) {
      continue;
    }
    const link = links(line).find((candidate) => !NAMESPACED.test(candidate.target));
    if (!link) {
      unparsed.push(line);
      continue;
    }
    const after = line.slice(link.end);
    lines.push({
      target: link.target,
      note: plainText(after.replace(/\{\{([^{}|]*)[^{}]*\}\}/g, "($1)")).replace(/^["':\s]+/, ""),
      mentioned: MENTION.test(after),
      heading: subheading,
    });
  }
  return { lines, unparsed };
}

const STATUS_NAMES: Record<string, string> = {
  alive: "Alive",
  active: "Alive",
  deceased: "Deceased",
  dead: "Deceased",
  died: "Deceased",
  unknown: "Unknown",
  undead: "Undead",
};

// The wiki's status is free text that covers adaptations too, such as
// "Alive (Novel) Deceased (1976 film)". This picks what the book says.
export function bookStatus(raw: string): string | null {
  const status = new RegExp(`\\b(${Object.keys(STATUS_NAMES).join("|")})\\b`, "gi");
  // The status word nearest before "(Novel ...)", or else the first one
  const forBook = /\([^)]*\b(novel|book|story|novella|original)\b[^)]*\)/i.exec(raw);
  const words = Array.from((forBook ? raw.slice(0, forBook.index) : raw).matchAll(status), (m) => m[1]);
  const word = forBook ? words[words.length - 1] : words[0];
  return word ? STATUS_NAMES[word.toLowerCase()] : null;
}

// ---------------------------------------------------------------------------
// Matching wiki links to catalog works

// Wiki titles add these to tell a work apart from a character or a film
const BOOK_QUALIFIERS = ["novel", "book"];
const SHORT_QUALIFIERS = ["short story", "story", "novella", "poem", "play", "screenplay", "teleplay"];
const QUALIFIER = /\s*\(([^()]*)\)\s*$/;

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['‘’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface WorkIndex {
  books: Map<string, Set<string>>; // normalized title → handles
  shorts: Map<string, Set<string>>;
}

export function indexWorks(
  bookList: { Title: string; handle: string }[],
  shortList: { title: string; handle: string }[]
): WorkIndex {
  const add = (index: Map<string, Set<string>>, title: string, handle: string) => {
    const key = normalizeTitle(title);
    index.set(key, (index.get(key) ?? new Set()).add(handle));
  };
  const index: WorkIndex = { books: new Map(), shorts: new Map() };
  bookList.forEach((book) => {
    add(index.books, book.Title, book.handle);
    // The wiki titles these by subtitle: "The Dark Tower IV: Wizard and Glass" is
    // "Wizard and Glass". Book VII's subtitle is also the series' name, so it's left out.
    const subtitle = /^The Dark Tower(?: [IVX]+)?: (.+)$/.exec(book.Title)?.[1];
    if (subtitle && subtitle !== "The Dark Tower") {
      add(index.books, subtitle, book.handle);
    }
  });
  shortList.forEach((short) => add(index.shorts, short.title, short.handle));
  return index;
}

export type WorkMatch = { handle: string } | { ambiguous: string[] } | null;

export function matchWork(target: string, index: WorkIndex): WorkMatch {
  const pick = (key: string, prefer?: "books" | "shorts"): WorkMatch => {
    const fromBooks = index.books.get(key) ?? new Set<string>();
    const fromShorts = index.shorts.get(key) ?? new Set<string>();
    let handles = new Set([...fromBooks, ...fromShorts]);
    if (prefer === "books" && fromBooks.size) {
      handles = fromBooks;
    } else if (prefer === "shorts" && fromShorts.size) {
      handles = fromShorts;
    }
    if (handles.size === 0) {
      return null;
    }
    return handles.size === 1 ? { handle: [...handles][0] } : { ambiguous: [...handles].sort() };
  };

  const exact = pick(normalizeTitle(target));
  if (exact) {
    return exact;
  }
  // "It (novel)" → "It", but not "Christine (car)" or "Carrie (1976 film)"
  const qualifier = QUALIFIER.exec(target)?.[1].toLowerCase();
  const stripped = normalizeTitle(target.replace(QUALIFIER, ""));
  if (qualifier && BOOK_QUALIFIERS.includes(qualifier)) {
    return pick(stripped, "books");
  }
  if (qualifier && SHORT_QUALIFIERS.includes(qualifier)) {
    return pick(stripped, "shorts");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fetching

let refresh = false;
let lastRequest = 0;
const stats = { requests: 0, cached: 0, oldestFetch: "" };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

async function api(params: Record<string, string>): Promise<any> {
  const query = new URLSearchParams({ format: "json", formatversion: "2", maxlag: "5", ...params });
  const key = crypto.createHash("sha256").update(query.toString()).digest("hex").slice(0, 20);
  const file = path.join(CACHE_DIR, `${key}.json`);

  if (!refresh && fs.existsSync(file)) {
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    stats.cached++;
    if (!stats.oldestFetch || saved.fetchedAt < stats.oldestFetch) {
      stats.oldestFetch = saved.fetchedAt;
    }
    return saved.response;
  }

  for (let attempt = 1; ; attempt++) {
    await sleep(lastRequest + PAUSE_MS - Date.now());
    lastRequest = Date.now();
    stats.requests++;
    const res = await fetch(`${API}?${query}`, { headers: { "User-Agent": USER_AGENT } });
    const type = res.headers.get("content-type") ?? "";
    const body: any = type.includes("application/json") ? await res.json() : null;

    // The wiki asked us to slow down, so wait as long as it says and try again
    const busy = res.status === 429 || res.status === 503 || body?.error?.code === "maxlag";
    if (busy && attempt < 3) {
      await sleep((Number(res.headers.get("retry-after")) || 30) * 1000);
      continue;
    }
    // Anything else, such as a bot check page, means stop rather than push on
    if (!res.ok || !body) {
      throw new Error(`The wiki answered ${res.status} (${type || "no content type"}). Stopping.`);
    }
    if (body.error) {
      throw new Error(`The wiki API returned ${body.error.code}: ${body.error.info}`);
    }

    const fetchedAt = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify({ url: `${API}?${query}`, fetchedAt, response: body }, null, 2));
    if (!stats.oldestFetch || fetchedAt < stats.oldestFetch) {
      stats.oldestFetch = fetchedAt;
    }
    return body;
  }
}

interface WikiPage {
  pageid: number;
  title: string;
  content: string;
}

// Requested title → page (after normalizing and following redirects), or null
async function fetchPages(titles: string[]): Promise<Map<string, WikiPage | null>> {
  const result = new Map<string, WikiPage | null>();
  for (let i = 0; i < titles.length; i += TITLES_PER_REQUEST) {
    const batch = titles.slice(i, i + TITLES_PER_REQUEST);
    const renamed = new Map<string, string>();
    const pages = new Map<string, any>();
    let next: Record<string, string> = {};
    do {
      const body = await api({
        action: "query",
        prop: "revisions",
        rvprop: "content",
        rvslots: "main",
        redirects: "1",
        titles: batch.join("|"),
        ...next,
      });
      for (const { from, to } of [...(body.query?.normalized ?? []), ...(body.query?.redirects ?? [])]) {
        renamed.set(from, to);
      }
      for (const page of body.query?.pages ?? []) {
        const known = pages.get(page.title);
        pages.set(page.title, { ...known, ...page, revisions: page.revisions ?? known?.revisions });
      }
      next = body.continue ?? {};
    } while (Object.keys(next).length);

    for (const title of batch) {
      let resolved = title;
      for (let hops = 0; renamed.has(resolved) && hops < 5; hops++) {
        resolved = renamed.get(resolved)!;
      }
      const page = pages.get(resolved);
      const content = page?.revisions?.[0]?.slots?.main?.content;
      result.set(
        title,
        page && !page.missing && typeof content === "string"
          ? { pageid: page.pageid, title: page.title, content }
          : null
      );
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Extracting what the catalog needs

export interface Extracted {
  id: number;
  name: string;
  wiki: { pageid: number; title: string; url: string } | null;
  hasInfobox: boolean;
  hasAppearances: boolean;
  status: string | null; // as the wiki writes it
  bookStatus: string | null; // just what the book says: "Alive", "Deceased"...
  gender: string | null;
  aliases: string[];
  residence: { home: string[]; location: string[]; residentOf: string[] };
  appearsIn: string[]; // handles, from the Appearances section
  mentionedIn: string[];
  categoryWorks: string[]; // handles of works the page is filed under, a weaker signal
  introWorks: string[]; // handles of works linked in the opening text, also weaker
  current: string[]; // appears_in today
  added: string[]; // in the Appearances section, missing from appears_in
  addedWeak: string[]; // only in categories or the opening text, missing from appears_in
  notListed: string[]; // in appears_in, but nowhere on the page
  mentionedOnly: string[]; // in appears_in, but the wiki says only mentioned
  unmatched: { target: string; note: string; heading: string | null }[];
  ambiguous: { target: string; handles: string[] }[];
  unparsed: string[];
  notes: string[]; // what follows each appearance link, such as "(mentioned)"
  categories: string[];
}

const pageUrl = (title: string) => WIKI + encodeURIComponent(title.replace(/ /g, "_")).replace(/%2F/g, "/");

// Link targets if the value has any, otherwise its plain text
function places(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  const targets = links(value)
    .map((link) => link.target)
    .filter((target) => !NAMESPACED.test(target));
  if (targets.length) {
    return [...new Set(targets)];
  }
  const text = plainText(value);
  return text ? [text] : [];
}

export function extract(villain: Villain, page: WikiPage | null, index: WorkIndex): Extracted {
  const result: Extracted = {
    id: villain.id,
    name: villain.name,
    wiki: page && { pageid: page.pageid, title: page.title, url: pageUrl(page.title) },
    hasInfobox: false,
    hasAppearances: false,
    status: null,
    bookStatus: null,
    gender: null,
    aliases: [],
    residence: { home: [], location: [], residentOf: [] },
    appearsIn: [],
    mentionedIn: [],
    categoryWorks: [],
    introWorks: [],
    current: villain.appears_in,
    added: [],
    addedWeak: [],
    notListed: [],
    mentionedOnly: [],
    unmatched: [],
    ambiguous: [],
    unparsed: [],
    notes: [],
    categories: [],
  };
  if (!page) {
    result.notListed = [...villain.appears_in];
    return result;
  }

  const infobox = parseInfobox(page.content);
  if (infobox) {
    result.hasInfobox = true;
    result.status = plainText(infobox.status ?? "") || null;
    result.bookStatus = result.status && bookStatus(result.status);
    // Some infoboxes call it "sex"
    const gender = plainText(infobox.gender || infobox.sex || "");
    result.gender = gender ? gender[0].toUpperCase() + gender.slice(1) : null;
    result.aliases = [
      ...new Set(
        (infobox.alias ?? "")
          .split(/\n|<br\s*\/?>/i)
          .map((alias) => plainText(alias.replace(/^\s*\*+/, "")))
          .filter((alias) => alias && alias !== villain.name && alias !== page.title)
      ),
    ];
    result.residence.home = places(infobox.home);
    result.residence.location = places(infobox.location);
  }

  result.categories = categories(page.content);
  const handlesFor = (titles: string[]) => [
    ...new Set(
      titles.flatMap((title) => {
        const match = matchWork(title, index);
        return match && "handle" in match ? [match.handle] : [];
      })
    ),
  ];
  // Pages are filed under their works: "The Stand", "Children Of The Corn Characters"
  result.categoryWorks = handlesFor(
    result.categories.map((category) => category.replace(/\s+(characters|villains|villlains)$/i, ""))
  );
  result.introWorks = handlesFor(introLinks(page.content));
  for (const category of result.categories) {
    const town = /^(.+?) residents$/i.exec(category)?.[1] ?? /^Residents of (.+)$/i.exec(category)?.[1];
    if (town) {
      result.residence.residentOf.push(town);
    }
  }

  const appearances = parseAppearances(page.content);
  if (appearances) {
    result.hasAppearances = true;
    result.unparsed = appearances.unparsed;
    result.notes = appearances.lines.map((line) => line.note);
    const appears = new Set<string>();
    const mentioned = new Set<string>();
    for (const line of appearances.lines) {
      const match = matchWork(line.target, index);
      if (!match) {
        result.unmatched.push({ target: line.target, note: line.note, heading: line.heading });
      } else if ("ambiguous" in match) {
        result.ambiguous.push({ target: line.target, handles: match.ambiguous });
      } else {
        (line.mentioned ? mentioned : appears).add(match.handle);
      }
    }
    // Appearing somewhere outranks a mention of the same work
    appears.forEach((handle) => mentioned.delete(handle));
    result.appearsIn = [...appears];
    result.mentionedIn = [...mentioned];
  }

  const current = new Set(villain.appears_in);
  const onPage = new Set([...result.appearsIn, ...result.mentionedIn]);
  result.added = result.appearsIn.filter((handle) => !current.has(handle));
  const weak = new Set([...result.categoryWorks, ...result.introWorks]);
  result.addedWeak = [...weak].filter((handle) => !current.has(handle) && !onPage.has(handle));
  result.mentionedOnly = villain.appears_in.filter((handle) => result.mentionedIn.includes(handle));
  result.notListed = villain.appears_in.filter((handle) => !onPage.has(handle) && !weak.has(handle));
  return result;
}

// ---------------------------------------------------------------------------
// Report

function writeReport(results: Extracted[]): string {
  const titleOf = new Map<string, string>();
  books.forEach((book) => titleOf.set(book.handle, book.Title));
  shorts.forEach((short) => titleOf.has(short.handle) || titleOf.set(short.handle, short.title));
  const works = (handles: string[]) => handles.map((handle) => titleOf.get(handle) ?? handle).join(", ");
  const villain = (r: Extracted) =>
    r.wiki ? `${r.id} [${r.name}](${r.wiki.url})` : `${r.id} ${r.name}`;
  const count = (predicate: (r: Extracted) => boolean) => results.filter(predicate).length;
  const sum = (pick: (r: Extracted) => number) => results.reduce((total, r) => total + pick(r), 0);

  const out: string[] = [];
  const table = (headers: string[], rows: string[][]) => {
    if (!rows.length) {
      out.push("_None._", "");
      return;
    }
    out.push(`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`);
    rows.forEach((row) => out.push(`| ${row.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`));
    out.push("");
  };

  const found = results.filter((r) => r.wiki);
  out.push(
    "# Wiki scrape report",
    "",
    `Villain pages from the Stephen King Wiki (CC BY-SA), fetched ${stats.oldestFetch.slice(0, 10)}. Nothing in \`catalog/\` was changed.`,
    "",
    "## Summary",
    "",
    `- **Pages found:** ${found.length} of ${results.length} villains`,
    `- **With a character infobox:** ${count((r) => r.hasInfobox)}; **with an Appearances section:** ${count((r) => r.hasAppearances)}`,
    `- **Appearance links matched to catalog works:** ${sum((r) => r.appearsIn.length + r.mentionedIn.length)}. Not matched: ${sum((r) => r.unmatched.length)} (mostly films, TV and works not in the catalog). Ambiguous: ${sum((r) => r.ambiguous.length)}.`,
    `- **New links from Appearances sections:** ${sum((r) => r.added.length)}, for ${count((r) => r.added.length > 0)} villains`,
    `- **New links from categories or the opening text only:** ${sum((r) => r.addedWeak.length)}, for ${count((r) => r.addedWeak.length > 0)} villains`,
    `- **Mentions (would become \`mentionedIn\`):** ${sum((r) => r.mentionedIn.length)}, for ${count((r) => r.mentionedIn.length > 0)} villains`,
    `- **Current links the page doesn't back up** (not in Appearances, categories or the opening text): ${sum((r) => r.notListed.length)}; **current links the wiki calls a mention only:** ${sum((r) => r.mentionedOnly.length)}`,
    `- **Residence:** home ${count((r) => r.residence.home.length > 0)}, location ${count((r) => r.residence.location.length > 0)}, residents category ${count((r) => r.residence.residentOf.length > 0)}, any ${count((r) => r.residence.home.length + r.residence.location.length + r.residence.residentOf.length > 0)}`,
    `- **Aliases:** ${count((r) => r.aliases.length > 0)} villains`,
    ""
  );

  out.push("## Villains with no wiki page", "");
  table(["Villain", "Current links"], results.filter((r) => !r.wiki).map((r) => [villain(r), works(r.current)]));

  out.push("## Pages without a character infobox or an Appearances section", "", "These may be the wrong page, or a page laid out differently.", "");
  table(
    ["Villain", "Wiki page", "Infobox", "Appearances"],
    found
      .filter((r) => !r.hasInfobox || !r.hasAppearances)
      .map((r) => [villain(r), r.wiki!.title, r.hasInfobox ? "yes" : "no", r.hasAppearances ? "yes" : "no"])
  );

  out.push("## New links", "", "Works the wiki lists as appearances that `appears_in` doesn't have.", "");
  table(
    ["Villain", "Adds", "Current"],
    results.filter((r) => r.added.length).map((r) => [villain(r), works(r.added), works(r.current)])
  );

  out.push(
    "## New links from categories or the opening text only",
    "",
    "The page is filed under these works or links them in its opening text, but they aren't in an Appearances section. Weaker evidence: check before adding.",
    ""
  );
  table(
    ["Villain", "Adds", "Current"],
    results
      .filter((r) => r.addedWeak.length)
      .map((r) => [villain(r), works(r.addedWeak), works(r.current)])
  );

  out.push("## Current links the page doesn't back up", "", "Kept as they are. Worth checking by hand.", "");
  table(
    ["Villain", "Not on the page", "Page lists"],
    found
      .filter((r) => r.notListed.length)
      .map((r) => [villain(r), works(r.notListed), works([...new Set([...r.appearsIn, ...r.categoryWorks, ...r.introWorks])])])
  );

  out.push("## Current links the wiki calls a mention", "");
  table(
    ["Villain", "Mentioned only"],
    results.filter((r) => r.mentionedOnly.length).map((r) => [villain(r), works(r.mentionedOnly)])
  );

  out.push("## Mentions", "");
  table(
    ["Villain", "Mentioned in"],
    results.filter((r) => r.mentionedIn.length).map((r) => [villain(r), works(r.mentionedIn)])
  );

  out.push(
    "## Status and gender differences",
    "",
    "Status compares what the book says. The wiki's full text is in the last column.",
    ""
  );
  table(
    ["Villain", "Catalog", "Wiki", "Wiki's status text"],
    found.flatMap((r) => {
      const v = villains.find((candidate) => candidate.id === r.id)!;
      const status = r.bookStatus && r.bookStatus !== v.status;
      const gender = r.gender && r.gender !== v.gender;
      if (!status && !gender) {
        return [];
      }
      const text = r.status ?? "";
      return [
        [
          villain(r),
          `${v.status}, ${v.gender ?? "no gender"}`,
          `${r.bookStatus ?? "?"}, ${r.gender ?? "?"}`,
          text.length > 90 ? `${text.slice(0, 90)}…` : text,
        ],
      ];
    })
  );

  out.push("## Residence", "", "As the wiki writes it. Matching these to places comes next.", "");
  table(
    ["Villain", "Home", "Location", "Residents of"],
    found
      .filter((r) => r.residence.home.length + r.residence.location.length + r.residence.residentOf.length)
      .map((r) => [
        villain(r),
        r.residence.home.join("; "),
        r.residence.location.join("; "),
        r.residence.residentOf.join("; "),
      ])
  );

  out.push("## Aliases", "");
  table(["Villain", "Aliases"], found.filter((r) => r.aliases.length).map((r) => [villain(r), r.aliases.join("; ")]));

  out.push("## Ambiguous links", "");
  table(
    ["Villain", "Link", "Could be"],
    results.flatMap((r) => r.ambiguous.map((a) => [villain(r), a.target, works(a.handles)]))
  );

  const unmatched = new Map<string, { count: number; headings: Set<string>; villains: Set<string> }>();
  for (const r of results) {
    for (const u of r.unmatched) {
      const entry = unmatched.get(u.target) ?? { count: 0, headings: new Set(), villains: new Set() };
      entry.count++;
      entry.villains.add(r.name);
      if (u.heading) {
        entry.headings.add(u.heading);
      }
      unmatched.set(u.target, entry);
    }
  }
  out.push(
    "## Links that matched no catalog work",
    "",
    "Most are adaptations or other authors' books, which are skipped on purpose. A catalog work in this list needs an override.",
    ""
  );
  table(
    ["Link", "Times", "Under", "Villains"],
    [...unmatched.entries()]
      .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
      .map(([target, e]) => [
        target,
        String(e.count),
        [...e.headings].join(", "),
        [...e.villains].slice(0, 3).join(", ") + (e.villains.size > 3 ? ", …" : ""),
      ])
  );

  const notes = new Map<string, number>();
  for (const note of results.flatMap((r) => r.notes)) {
    const key = note.toLowerCase() || "(none)";
    notes.set(key, (notes.get(key) ?? 0) + 1);
  }
  out.push("## Notes after appearance links", "", "Anything mentioning \"mention\" is treated as a mention.", "");
  table(
    ["Note", "Times"],
    [...notes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([note, n]) => [note, String(n)])
  );

  out.push("## Appearance lines with no link", "");
  table(["Villain", "Line"], results.flatMap((r) => r.unparsed.map((line) => [villain(r), line])));

  return out.join("\n");
}

async function main(): Promise<void> {
  refresh = process.argv.includes("--refresh");
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const pages = await fetchPages(villains.map((villain) => villain.name));

  const index = indexWorks(books, shorts);
  const results = villains.map((villain) => extract(villain, pages.get(villain.name) ?? null, index));

  fs.writeFileSync(path.join(OUT_DIR, "villains.json"), JSON.stringify(results, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT_DIR, "report.md"), writeReport(results) + "\n");

  console.log(
    `Wiki requests: ${stats.requests} (${stats.cached} from cache). ` +
      `Found ${results.filter((r) => r.wiki).length} of ${results.length} villain pages. ` +
      `Report: wiki-scrape/report.md`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
