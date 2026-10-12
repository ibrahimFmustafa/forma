# Architecture

```text
Pointer / keyboard / inspector
             │
             ▼
TypeScript interaction controller ───── localStorage / .forma / SVG / PNG
             │                                    ▲
             │ direct C ABI                       │ snapshot
             ▼                                    │
Rust WebAssembly engine ───────────────────────────┘
  Scene graph • geometry • IDs • transactions • bounded undo/redo
             │
             ▼
SVG scene renderer (DOM, native browser text and vector rasterization)
```

## Responsibility boundaries

`engine/src/lib.rs` owns all persistent layer state. UI gestures begin a transaction, mutate through exported functions, and commit once on pointer-up. Escape cancels. Undo/redo swaps scene snapshots. Empty transactions do not invalidate redo. Document loads validate first, then replace content as a single undoable transaction.

`src/engine.ts` wraps the raw ABI and validates imported JSON. `src/main.ts` owns transient selection, viewport, keyboard/pointer state, controls, and storage. `src/render.ts` projects snapshots into escaped SVG. `src/demo.ts` creates original editable sample artwork. The renderer does not require WebGL or a server. Rust does not rasterize pixels in this version.

## ABI

No wasm-bindgen, serde, or runtime imports. The `cdylib` exposes a compact numeric C ABI. `input_alloc(len)` returns a pointer into a reusable input buffer, capped at 65,536 bytes. The host writes UTF-8, then calls `set_text(id, slot)`. `snapshot()` serializes state into an output buffer; use `output_len()` and read it before the next snapshot. Buffer pointers must never be cached across mutations or memory growth. Numeric inputs reject non-finite values and clamp dimensions, opacity, colors, and positions.

Layer kinds are rectangle (0), ellipse (1), text (2), frame (3), line (4), and freehand path (5). Field indices are documented alongside `set_num` and mirrored by the wrapper. Snapshots are JSON with stable numeric IDs within a session. Import creates fresh IDs and remaps parents. ID counters are not rolled back by undo, avoiding ID reuse.

## Geometry and hierarchy

Coordinates are absolute world coordinates, even inside frames. Translating a frame translates its descendants once. Frames organize stacking into subtrees; the renderer and hit test traverse the same hierarchy. Reparenting preserves position, rejects cycles, and accepts frame parents only. Containers are axis-aligned. Hidden/locked ancestors make descendants non-interactive. Shape rotation uses its center; selection bounds include all transformed corners. Frames do not clip overflowing children. Ellipse hit tests use the ellipse equation; freehand uses bounds.

## Persistence and boundaries

The `.forma` envelope is `{ format: "forma", version: 1, name, nodes }`. Node schema validation includes finite numeric fields, string limits, duplicate IDs, parent type, hierarchy cycles/depth, and restricted drawing path syntax. Text is escaped before SVG insertion. Imported SVG/HTML and remote asset URLs are deliberately unsupported in v0.1. A future format change must either migrate old versions explicitly or fail before replacing the user's document.

History stores up to 80 full scene snapshots. This is simple and reliable for a small alpha; large-document work should move to command deltas and a byte budget before raising the layer limit. SVG DOM rebuilding and linear scans are also known scaling limits. No performance claims or collaboration guarantees are made.
