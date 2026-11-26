import "./env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { graph } from "../src/graph/build";
import { decode } from "../src/client/model";
import { layout, Rect, EgoLayout } from "../src/client/layout";

const g = decode(graph.payload);

// The graph box at a 1280px window (beside the panel), at 768 (full width)
// and on a 360px phone (square)
const boxes = [
  { name: "1280", w: 868, h: 543 },
  { name: "768", w: 720, h: 450 },
  { name: "360", w: 326, h: 326 },
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
      const l = layout(g, i, box);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      return { i, l, ms };
    });

    it("gives the same layout for the same record", () => {
      for (const i of [g.byKey.get("place-28")!, g.byKey.get("villain-57")!, g.linked[3]]) {
        assert.deepEqual(layout(g, i, box), layout(g, i, box));
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

    it("lays out a record in under 4 ms on average", () => {
      const avg = results.reduce((s, r) => s + r.ms, 0) / results.length;
      const worst = results.reduce((a, b) => (b.ms > a.ms ? b : a));
      assert.ok(avg < 4, `average ${avg.toFixed(2)} ms, worst ${worst.ms.toFixed(1)} ms (${g.nodes[worst.i].name})`);
    });
  });
}
