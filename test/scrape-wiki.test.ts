import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { books, shorts, Villain } from "../src/catalog";
import {
  bookStatus,
  categories,
  extract,
  indexWorks,
  matchWork,
  parseAppearances,
  parseInfobox,
} from "../scripts/scrape-wiki";

// Laid out like a real character page on the wiki
const PAGE = `{{Character
|image = <gallery>
Barlow.png|2024 Movie
</gallery>
|name = Kurt Barlow
|gender = male
|status = Deceased
|alias = *Mr. Barlow
*The Master
|home = [[Marsten House]]
|location = [[Jerusalem's Lot, Maine]]<ref>Chapter 3|p. 40</ref>
|sex=Male|job=[[Antiques|Antique]] dealer|died=1975}}
'''Kurt Barlow''' is the main antagonist of ''[[Salem's Lot]]'' and appears in the [[Salem's Lot (film)|film]]. He is no relation to [[Annie Wilkes]] of [[Misery]].

==Appearances==
*[[Salem's Lot]]
*''[[One for the Road]]'' (mentioned)
*[[Salem's Lot (2004 miniseries)]]
*[[Wizard and Glass]] (indirectly referenced)
===Other===
*A line with no link

==Trivia==
*[[It (novel)]]
[[Category:Jerusalem's Lot residents]]
[[Category:Residents of Maine]]
[[Category:Vampires|Barlow]]
[[Category:Salem's Lot]]
[[Category:The Stand]]`;

const index = indexWorks(books, shorts);

describe("scrape-wiki parsing", () => {
  it("reads infobox parameters, including ones that span lines", () => {
    const infobox = parseInfobox(PAGE)!;
    assert.equal(infobox.gender, "male");
    assert.equal(infobox.status, "Deceased");
    assert.equal(infobox.home, "[[Marsten House]]");
    assert.equal(infobox.alias, "*Mr. Barlow\n*The Master");
    // The gallery's own pipes don't start new parameters
    assert.match(infobox.image, /Barlow\.png\|2024 Movie/);
    // Several parameters on one line, with pipes inside links and refs
    assert.equal(infobox.job, "[[Antiques|Antique]] dealer");
    assert.equal(infobox.died, "1975");
    assert.match(infobox.location, /<ref>Chapter 3\|p\. 40<\/ref>$/);
    assert.equal(parseInfobox("No infobox here"), null);
  });

  it("reads only the Appearances section, with notes and subheadings", () => {
    const { lines, unparsed } = parseAppearances(PAGE)!;
    assert.deepEqual(
      lines.map((line) => [line.target, line.mentioned, line.heading]),
      [
        ["Salem's Lot", false, null],
        ["One for the Road", true, null],
        ["Salem's Lot (2004 miniseries)", false, null],
        ["Wizard and Glass", true, null],
      ]
    );
    assert.equal(lines[1].note, "(mentioned)");
    assert.deepEqual(unparsed, ["*A line with no link"]);
    assert.equal(parseAppearances("==Biography==\n*[[Carrie]]"), null);
  });

  it("reads categories without their sort keys", () => {
    assert.deepEqual(categories(PAGE), [
      "Jerusalem's Lot residents",
      "Residents of Maine",
      "Vampires",
      "Salem's Lot",
      "The Stand",
    ]);
  });
});

describe("scrape-wiki status", () => {
  it("picks what the book says from the wiki's status text", () => {
    assert.equal(bookStatus("Deceased"), "Deceased");
    assert.equal(bookStatus("Alive (Novel and 2026 miniseries) Deceased (1976 film)"), "Alive");
    assert.equal(bookStatus("Deceased (1976 film) Alive (novel)"), "Alive");
    assert.equal(bookStatus("Deceased Alive (Novel and Film)"), "Alive");
    assert.equal(bookStatus("Deceased (in Cujo) Alive (in Cat's Eye)"), "Deceased");
    assert.equal(bookStatus("Died to blood loss via flying leeches"), "Deceased");
    assert.equal(bookStatus("Active (most likely)"), "Alive");
    assert.equal(bookStatus("Possibly a ghost"), null);
  });
});

describe("scrape-wiki matching", () => {
  it("matches wiki titles to catalog handles", () => {
    assert.deepEqual(matchWork("Salem's Lot", index), { handle: "salem-s-lot" });
    assert.deepEqual(matchWork("'Salem's Lot", index), { handle: "salem-s-lot" });
    assert.deepEqual(matchWork("It (novel)", index), { handle: "it" });
    // A novella that's in both files has one handle
    assert.deepEqual(matchWork("Elevation (novella)", index), { handle: "elevation" });
    // Dark Tower books go by their subtitles on the wiki
    assert.deepEqual(matchWork("Wizard and Glass", index), { handle: "the-dark-tower-iv-wizard-and-glass" });
    // ...except book VII, whose subtitle is the series' name
    assert.equal(matchWork("The Dark Tower", index), null);
  });

  it("skips characters, films and other things that share a title", () => {
    assert.equal(matchWork("Christine (car)", index), null);
    assert.equal(matchWork("Carrie (1976 film)", index), null);
    assert.equal(matchWork("NOS4A2", index), null);
  });

  it("uses the qualifier to choose between a book and a short", () => {
    const twins = indexWorks([{ Title: "Twin", handle: "twin-book" }], [{ title: "Twin", handle: "twin-short" }]);
    assert.deepEqual(matchWork("Twin", twins), { ambiguous: ["twin-book", "twin-short"] });
    assert.deepEqual(matchWork("Twin (novel)", twins), { handle: "twin-book" });
    assert.deepEqual(matchWork("Twin (short story)", twins), { handle: "twin-short" });
  });
});

describe("scrape-wiki extraction", () => {
  const villain = { id: 2, name: "Kurt Barlow", appears_in: ["salem-s-lot", "carrie"] } as Villain;
  const page = { pageid: 1, title: "Kurt Barlow", content: PAGE };

  it("compares the wiki's appearances with appears_in", () => {
    const result = extract(villain, page, index);
    assert.deepEqual(result.appearsIn, ["salem-s-lot"]);
    assert.deepEqual(result.mentionedIn, ["one-for-the-road", "the-dark-tower-iv-wizard-and-glass"]);
    assert.deepEqual(result.introWorks, ["salem-s-lot", "misery"]);
    assert.deepEqual(result.added, []);
    assert.deepEqual(result.categoryWorks, ["salem-s-lot", "the-stand"]);
    // Weaker evidence: categories and the opening text, kept apart from Appearances
    assert.deepEqual(result.addedWeak, ["the-stand", "misery"]);
    assert.deepEqual(result.notListed, ["carrie"]);
    assert.deepEqual(result.unmatched.map((u) => u.target), ["Salem's Lot (2004 miniseries)"]);
  });

  it("collects residence, aliases and status", () => {
    const result = extract(villain, page, index);
    assert.deepEqual(result.residence, {
      home: ["Marsten House"],
      location: ["Jerusalem's Lot, Maine"],
      residentOf: ["Jerusalem's Lot", "Maine"],
    });
    assert.deepEqual(result.aliases, ["Mr. Barlow", "The Master"]);
    assert.equal(result.status, "Deceased");
    assert.equal(result.gender, "Male");
    assert.equal(result.wiki?.url, "https://stephenking.fandom.com/wiki/Kurt_Barlow");
  });

  it("keeps current links when the villain has no page", () => {
    const result = extract(villain, null, index);
    assert.equal(result.wiki, null);
    assert.deepEqual(result.notListed, ["salem-s-lot", "carrie"]);
  });
});
