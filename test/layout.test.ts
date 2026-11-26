import "./env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { graph } from "../src/graph/build";
import { decode } from "../src/client/model";
import type { GraphPayload, PayloadNode } from "../src/graph/payload";
import { layout, estimate, Rect, EgoLayout, Measure } from "../src/client/layout";

const g = decode(graph.payload);

// Character widths that vary like a real font's: capitals and W or M wide,
// i, l and spaces narrow. The default estimate is linear, which once hid
// truncated labels that measured wider than their boxes.
const uneven: Measure = (text, px, weight) => {
  let em = 0;
  for (const ch of text) em += /[WM@]/.test(ch) ? 0.95 : /[A-Z]/.test(ch) ? 0.7 : /[iljtf.,'’:;! ]/.test(ch) ? 0.3 : 0.55;
  return em * px * (weight >= 600 ? 1.05 : 1);
};

// The graph box at a 1280px window (beside the panel), at 1024 and 768 (full
// width), and on 430 and 360px phones (square)
const boxes: { name: string; w: number; h: number; measure?: Measure }[] = [
  { name: "1280", w: 868, h: 543 },
  { name: "1024", w: 952, h: 595 },
  { name: "768", w: 720, h: 450 },
  { name: "430", w: 396, h: 396 },
  { name: "360", w: 326, h: 326 },
  { name: "1280, uneven character widths", w: 868, h: 543, measure: uneven },
  { name: "360, uneven character widths", w: 326, h: 326, measure: uneven },
];

const overlap = (a: Rect, b: Rect) => a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5;
const inside = (r: Rect, w: number, h: number) => r.x0 >= -0.5 && r.y0 >= -0.5 && r.x1 <= w + 0.5 && r.y1 <= h + 0.5;

// Every label, chip and glyph box in a layout, with what it belongs to
function boxesOf(l: EgoLayout) {
  const out: { owner: string; rect: Rect }[] = [{ owner: "focus label", rect: l.focus.label.rect }];
  for (const s of l.slots) {
    const owner = s.type === "chip" ? `chip ${s.chipText}` : g.nodes[s.i].name;
    out.push({ owner, rect: s.rect });
    if (s.label) out.push({ owner: owner + " label", rect: s.label.rect });
  }
  return out;
}

for (const box of boxes) {
  describe(`layout at ${box.name}`, () => {
    const results = g.linked.map((i) => {
      const t0 = process.hrtime.bigint();
      const l = layout(g, i, box, { measure: box.measure });
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      return { i, l, ms };
    });

    it("gives the same layout for the same record", () => {
      for (const i of [g.byKey.get("place-28")!, g.byKey.get("villain-57")!, g.linked[3]]) {
        assert.deepEqual(layout(g, i, box, { measure: box.measure }), layout(g, i, box, { measure: box.measure }));
      }
    });

    it("keeps every label and chip inside the box", () => {
      const bad = results.flatMap(({ i, l }) =>
        boxesOf(l)
          .filter((b) => !inside(b.rect, box.w, box.h))
          .map((b) => `${g.nodes[i].name}: ${b.owner}`)
      );
      assert.deepEqual(bad.slice(0, 10), []);
    });

    it("never overlaps labels, chips or records", () => {
      const bad: string[] = [];
      for (const { i, l } of results) {
        const all = boxesOf(l);
        for (let p = 0; p < all.length; p++) {
          for (let q = p + 1; q < all.length; q++) {
            if (overlap(all[p].rect, all[q].rect)) bad.push(`${g.nodes[i].name}: ${all[p].owner} × ${all[q].owner}`);
          }
        }
      }
      assert.deepEqual(bad.slice(0, 10), [], `${bad.length} overlaps`);
    });

    it("makes every label's box as wide as its text", () => {
      const measure = box.measure ?? estimate;
      const bad: string[] = [];
      for (const { i, l } of results) {
        const font = l.compact ? 12 : 13;
        const labels = [
          { label: l.focus.label, px: l.compact ? 14 : 16, weight: 600 },
          ...l.slots.flatMap((s) => (s.label ? [{ label: s.label, px: font, weight: 500 }] : [])),
        ];
        for (const { label, px, weight } of labels) {
          // Boxes have 6px of padding each side
          const room = label.rect.x1 - label.rect.x0 - 12;
          if (measure(label.text, px, weight) > room + 0.5) bad.push(`${g.nodes[i].name}: "${label.text}"`);
        }
      }
      assert.deepEqual(bad.slice(0, 10), [], `${bad.length} labels wider than their boxes`);
    });

    it("shows or counts every drawn link once, per field", () => {
      for (const { i, l } of results) {
        const ring = l.slots.filter((s) => s.type === "node");
        assert.equal(new Set(ring.map((s) => s.i)).size, ring.length);
        for (const f of l.fields) {
          assert.equal(f.shown + f.more, f.total, `${g.nodes[i].name} ${f.field}`);
          assert.equal(ring.filter((s) => s.field === f.field).length, f.shown);
          assert.equal(l.slots.some((s) => s.type === "chip" && s.field === f.field), f.more > 0);
        }
        const drawn = new Set(l.slots.filter((s) => s.type === "node").map((s) => s.i));
        const total = l.fields.reduce((n, f) => n + f.total, 0);
        assert.equal(total, g.nodes[i].drawn.size, g.nodes[i].name);
        assert.ok(drawn.size <= total);
      }
    });

    it("never hides a heavier record while showing a lighter one", () => {
      for (const { i, l } of results) {
        for (const chip of l.slots.filter((s) => s.type === "chip")) {
          const shown = l.slots.filter((s) => s.type === "node" && s.field === chip.field);
          for (const s of shown) {
            assert.ok(g.nodes[s.i].weight >= g.nodes[chip.i].weight, `${g.nodes[i].name} ${chip.field}`);
          }
        }
      }
    });

    it("goes all the way round the ring, not bunched to one side", () => {
      const bad: string[] = [];
      for (const { i, l } of results) {
        if (l.slots.length < 4) continue;
        const deg = l.slots.map((s) => (((s.angle * 180) / Math.PI) % 360 + 450) % 360).sort((a, b) => a - b);
        const widest = Math.max(...deg.map((d, k) => (k ? d - deg[k - 1] : d + 360 - deg[deg.length - 1])));
        if (widest > 150) bad.push(`${g.nodes[i].name} ${Math.round(widest)}°`);
      }
      assert.deepEqual(bad, []);
    });

    // The SK-045 budget, checked locally: a shared CI runner's timing says
    // more about the runner than the change
    const timing = box.measure ? "only timed with the default measure" : process.env.CI ? "not timed in CI" : false;
    it("lays out a record in under 4 ms on average", { skip: timing }, () => {
      const avg = results.reduce((s, r) => s + r.ms, 0) / results.length;
      const worst = results.reduce((a, b) => (b.ms > a.ms ? b : a));
      assert.ok(avg < 4, `average ${avg.toFixed(2)} ms, worst ${worst.ms.toFixed(1)} ms (${g.nodes[worst.i].name})`);
    });
  });
}

// A made-up character with long-named fields and dozens of links, more than
// the catalog has today: the wide "+N" chips it needs must stay in the box
// on a phone, where there's least room at the sides
describe("layout of a record with long field names", () => {
  const fieldNames = ["relationships", "acquaintances", "family_members"];
  const fixture = (fields: string[], per: number): GraphPayload => {
    const nodes: PayloadNode[] = [["character", 1, "Focus", {}]];
    const links: Record<string, number[]> = {};
    for (const field of fields) {
      links[field] = [];
      for (let k = 0; k < per; k++) {
        links[field].push(nodes.length);
        nodes.push(["character", nodes.length + 1, `Someone ${nodes.length}`, {}]);
      }
    }
    nodes[0][3] = links;
    return {
      v: 1,
      schema: {
        kinds: { character: { label: "Character", plural: "characters", noun: "characters", example: 1 } },
        fields: Object.fromEntries(fields.map((f) => [`character.${f}`, { family: "related" as const }])),
      },
      nodes,
    };
  };

  it("keeps every chip inside the box", () => {
    const bad: string[] = [];
    for (let n = 1; n <= fieldNames.length; n++) {
      for (const per of [8, 15, 30]) {
        const fg = decode(fixture(fieldNames.slice(0, n), per));
        for (const w of [280, 300, 326, 396]) {
          for (const s of layout(fg, 0, { w, h: w }).slots) {
            if (!inside(s.rect, w, w)) bad.push(`${n} fields of ${per} at ${w}: ${s.chipText || fg.nodes[s.i].name}`);
          }
        }
      }
    }
    assert.deepEqual(bad, []);
  });
});
