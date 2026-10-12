import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
function moduleURL(file, imports = {}) {
  let source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  for (const [name, url] of Object.entries(imports))
    source = source
      .replaceAll(`from '${name}'`, `from '${url}'`)
      .replaceAll(`from "${name}"`, `from "${url}"`);
  return (
    "data:text/javascript;base64," +
    Buffer.from(
      ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
        },
      }).outputText,
    ).toString("base64")
  );
}
const engineURL = moduleURL("engine.ts");
const { Engine, validate } = await import(engineURL);
const { exportSVG, box } = await import(
  moduleURL("render.ts", { "./engine": engineURL })
);
const { demo } = await import(moduleURL("demo.ts", { "./engine": engineURL }));
async function setup() {
  const e = new Engine();
  const { instance } = await WebAssembly.instantiate(
    readFileSync(new URL("../public/forma_core.wasm", import.meta.url)),
    {},
  );
  e.api = instance.exports;
  return e;
}
test("Forma document round-trip preserves content and parent relationships", async () => {
  const e = await setup();
  demo(e);
  const before = e.nodes();
  e.load(before);
  const after = e.nodes();
  assert.equal(after.length, before.length);
  assert.equal(after[1].parent, after[0].id);
  assert.deepEqual(
    after.map(({ id, parent, ...n }) => n),
    before.map(({ id, parent, ...n }) => n),
  );
});
test("failed validation leaves the existing document and history intact", async () => {
  const e = await setup();
  demo(e);
  const before = e.nodes();
  const bad = structuredClone(before);
  bad[1].parent = 999;
  assert.throws(() => e.load(bad), /hierarchy/);
  assert.deepEqual(e.nodes(), before);
  assert.equal(e.api.history_count(0), 0);
});
test("a valid imported document can be undone as one transaction", async () => {
  const e = await setup();
  demo(e);
  const before = e.nodes();
  e.load([]);
  assert.equal(e.nodes().length, 0);
  e.api.undo();
  assert.deepEqual(e.nodes(), before);
});
test("schema rejects duplicate IDs, cycles and non-finite values", async () => {
  const e = await setup();
  demo(e);
  const a = e.nodes();
  assert.throws(() => validate([a[0], a[0]]));
  assert.throws(() => validate([{ ...a[0], parent: a[0].id }]));
  assert.throws(() => validate([{ ...a[0], w: NaN }]));
  assert.throws(() => validate([{ ...a[0], visible: "yes" }]));
});
test("SVG export escapes untrusted text and has no event handlers", async () => {
  const e = await setup();
  e.add(2, 0, 0, 100, 40, { text: '<script>alert("x")</script> & 🌿' });
  const { svg } = exportSVG(e.nodes());
  assert.ok(svg.includes("&lt;script&gt;"));
  assert.ok(!svg.includes("<script>"));
  assert.ok(svg.includes("🌿"));
});
test("import rejects markup in freehand paths", async () => {
  const e = await setup();
  e.add(5, 0, 0, 100, 100, { text: "M 0 0 L 100 100" });
  const n = e.nodes()[0];
  assert.doesNotThrow(() => validate([n]));
  assert.throws(() => validate([{ ...n, text: '" onload="alert(1)' }]));
});
test("rotated bounds include all four transformed corners", async () => {
  const e = await setup();
  e.add(0, 0, 0, 100, 20, { rotation: 90 });
  const b = box(e.nodes());
  assert.ok(Math.abs(b.w - 20) < 1e-8);
  assert.ok(Math.abs(b.h - 100) < 1e-8);
});
test("sample artwork exports with its nested text and shapes", async () => {
  const e = await setup();
  demo(e);
  const { svg, w, h } = exportSVG(e.nodes());
  assert.equal(w, 964);
  assert.equal(h, 684);
  assert.ok(svg.includes("Less rush."));
  assert.ok(svg.includes("<ellipse"));
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'));
});
test("oversized text is rejected before it can silently truncate", async () => {
  const e = await setup();
  const id = e.add(2, 0, 0, 10, 10);
  assert.throws(() => e.text(id, 1, "a".repeat(16001)), /too long/);
  assert.equal(e.nodes()[0].text, "Your text");
});
