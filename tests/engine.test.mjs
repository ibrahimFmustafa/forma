import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const wasm = readFileSync(
  new URL("../public/forma_core.wasm", import.meta.url),
);
async function setup() {
  const { instance } = await WebAssembly.instantiate(wasm, {});
  const e = instance.exports;
  const state = () => {
    const p = e.snapshot();
    return JSON.parse(
      new TextDecoder().decode(
        new Uint8Array(e.memory.buffer, p, e.output_len()),
      ),
    );
  };
  const text = (id, s, slot = 1) => {
    const b = new TextEncoder().encode(s),
      p = e.input_alloc(b.length);
    new Uint8Array(e.memory.buffer, p, b.length).set(b);
    e.set_text(id, slot);
  };
  const tx = (fn) => {
    e.begin();
    fn();
    e.commit();
  };
  return { e, state, text, tx };
}
test("the compiled Rust module has no runtime imports", async () => {
  assert.deepEqual(
    WebAssembly.Module.imports(await WebAssembly.compile(wasm)),
    [],
  );
});
test("creating and editing a shape persists typed properties", async () => {
  const { e, state, tx } = await setup();
  let id;
  tx(() => {
    id = e.add(0, 10, 20, 100, 80);
    e.set_num(id, 5, 0xff0088);
    e.set_num(id, 8, 12);
  });
  assert.equal(state()[0].fill, 0xff0088);
  assert.equal(state()[0].radius, 12);
  assert.equal(e.history_count(0), 1);
});
test("a drag transaction undoes as one operation and can redo", async () => {
  const { e, state, tx } = await setup();
  const id = e.add(0, 0, 0, 100, 100);
  tx(() => {
    for (let i = 0; i < 100; i++) e.translate(id, 1, 2);
  });
  assert.equal(state()[0].x, 100);
  e.undo();
  assert.equal(state()[0].x, 0);
  e.redo();
  assert.equal(state()[0].y, 200);
});
test("cancel restores the state without adding history", async () => {
  const { e, state } = await setup();
  const id = e.add(0, 0, 0, 10, 10);
  e.begin();
  e.remove(id);
  e.cancel();
  assert.equal(state().length, 1);
  assert.equal(e.history_count(0), 0);
});
test("a new edit invalidates redo; empty transaction does not", async () => {
  const { e, tx } = await setup();
  const id = e.add(0, 0, 0, 10, 10);
  tx(() => e.translate(id, 10, 0));
  e.undo();
  tx(() => {});
  assert.equal(e.history_count(1), 1);
  tx(() => e.translate(id, 0, 20));
  assert.equal(e.redo(), 0);
});
test("history retains at most 80 committed operations", async () => {
  const { e, tx } = await setup();
  const id = e.add(0, 0, 0, 10, 10);
  for (let i = 0; i < 100; i++) tx(() => e.translate(id, 1, 0));
  assert.equal(e.history_count(0), 80);
});
test("moving a frame moves descendants at arbitrary depth", async () => {
  const { e, state } = await setup();
  const a = e.add(3, 0, 0, 500, 500),
    b = e.add(3, 10, 10, 200, 200),
    c = e.add(2, 20, 30, 100, 40);
  e.reparent(b, a);
  e.reparent(c, b);
  e.translate(a, 50, 60);
  assert.deepEqual(
    state().map((n) => [n.x, n.y]),
    [
      [50, 60],
      [60, 70],
      [70, 90],
    ],
  );
});
test("cyclic, self and non-frame parent relationships are rejected", async () => {
  const { e } = await setup();
  const a = e.add(3, 0, 0, 500, 500),
    b = e.add(3, 0, 0, 100, 100),
    c = e.add(0, 0, 0, 10, 10);
  assert.equal(e.reparent(b, a), 1);
  assert.equal(e.reparent(a, b), 0);
  assert.equal(e.reparent(a, a), 0);
  assert.equal(e.reparent(b, c), 0);
  assert.equal(e.reparent(b, 999), 0);
});
test("deleting a frame deletes descendants and undo restores hierarchy", async () => {
  const { e, state, tx } = await setup();
  const a = e.add(3, 0, 0, 500, 500),
    b = e.add(0, 10, 10, 20, 20);
  e.reparent(b, a);
  tx(() => e.remove(a));
  assert.equal(state().length, 0);
  e.undo();
  assert.equal(state()[1].parent, a);
});
test("duplicating a subtree remaps IDs and keeps hierarchy", async () => {
  const { e, state } = await setup();
  const a = e.add(3, 0, 0, 500, 500),
    b = e.add(0, 10, 10, 20, 20);
  e.reparent(b, a);
  const copy = e.duplicate(a),
    all = state();
  assert.equal(all.length, 4);
  assert.equal(all[3].parent, copy);
  assert.equal(all[3].x, 34);
  assert.notEqual(all[3].id, b);
});
test("hit testing chooses the top layer, respecting stacking changes", async () => {
  const { e } = await setup();
  const a = e.add(0, 0, 0, 100, 100),
    b = e.add(0, 0, 0, 100, 100);
  assert.equal(e.hit_test(20, 20), b);
  e.reorder(a, 1);
  assert.equal(e.hit_test(20, 20), a);
});
test("nested hit testing follows frame stacking, not flat insertion order", async () => {
  const { e } = await setup();
  const a = e.add(3, 0, 0, 100, 100),
    b = e.add(3, 0, 0, 100, 100),
    child = e.add(0, 0, 0, 100, 100);
  e.reparent(child, a);
  assert.equal(e.hit_test(50, 50), b);
  e.reorder(a, 1);
  assert.equal(e.hit_test(50, 50), child);
});
test("locked or hidden parents make descendants non-interactive", async () => {
  const { e } = await setup();
  const a = e.add(3, 0, 0, 100, 100),
    b = e.add(0, 0, 0, 20, 20);
  e.reparent(b, a);
  e.set_num(a, 13, 1);
  assert.equal(e.hit_test(10, 10), 0);
  e.set_num(a, 13, 0);
  e.set_num(a, 12, 0);
  assert.equal(e.hit_test(10, 10), 0);
});
test("rotated rectangle hit testing uses local coordinates", async () => {
  const { e } = await setup();
  const id = e.add(0, 0, 0, 100, 20);
  e.set_num(id, 4, 90);
  assert.equal(e.hit_test(50, 40), id);
  assert.equal(e.hit_test(90, 10), 0);
});
test("ellipse hit testing excludes bounding-box corners", async () => {
  const { e } = await setup();
  const id = e.add(1, 0, 0, 100, 100);
  assert.equal(e.hit_test(50, 50), id);
  assert.equal(e.hit_test(1, 1), 0);
});
test("UTF-8 Arabic, quotes and control characters round-trip safely", async () => {
  const { e, state, text } = await setup();
  const id = e.add(2, 0, 0, 100, 40);
  const value = 'مرحبا بالعالم 🌿\n"Forma"\\\t\u0000';
  text(id, value);
  assert.equal(state()[0].text, value);
});
test("invalid numeric values do not corrupt a document", async () => {
  const { e, state } = await setup();
  assert.equal(e.add(0, NaN, 0, 1, 1), 0);
  assert.equal(e.add(7, 0, 0, 1, 1), 0);
  const id = e.add(0, 0, 0, 20, 20);
  e.set_num(id, 2, Infinity);
  e.translate(id, NaN, 1);
  e.set_num(id, 9, 4);
  assert.equal(state()[0].w, 20);
  assert.equal(state()[0].x, 0);
  assert.equal(state()[0].opacity, 1);
});
test("layer limit is enforced without partial subtree duplication", async () => {
  const { e, state } = await setup();
  const root = e.add(3, 0, 0, 100, 100),
    child = e.add(0, 0, 0, 10, 10);
  e.reparent(child, root);
  for (let i = 2; i < 1999; i++) e.add(0, 0, 0, 1, 1);
  assert.equal(e.duplicate(root), 0);
  assert.equal(state().length, 1999);
  e.add(0, 0, 0, 1, 1);
  assert.equal(e.add(0, 0, 0, 1, 1), 0);
});
test("IDs are not reused after undo, keeping imported references unambiguous", async () => {
  const { e, tx } = await setup();
  let first;
  tx(() => {
    first = e.add(0, 0, 0, 10, 10);
  });
  e.undo();
  const next = e.add(0, 0, 0, 10, 10);
  assert.ok(next > first);
});
