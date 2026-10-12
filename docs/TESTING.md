# Testing

`npm test` executes the real compiled WebAssembly artifact, not a JavaScript substitute. Tests cover transactions, history limits, parent transforms, cycle rejection, duplicate/delete subtree behavior, stacking, rotation/ellipse hit tests, inherited locks/visibility, Arabic/Unicode round trips, input bounds, validated document import, import undo, SVG escaping and original sample export.

`npm run build` performs TypeScript checking and a production Vite build. CI rebuilds the Rust engine from source, runs these checks, and also runs native Rust unit tests on Linux.

## Manual browser checklist

- Open the original sample and verify no console exceptions.
- Draw a rectangle and ellipse; drag, resize, rotate and recolor a selection.
- Edit multiline text; undo and redo; reload to verify local autosave.
- Expand frames, select children, hide/lock and reorder layers.
- Duplicate/delete a frame; undo restores descendants.
- Select several objects, align and nudge; pan and zoom without modifying geometry.
- Export `.forma`, SVG and PNG; reopen the `.forma` file and compare content.
- Reject malformed documents without clearing existing work.
- Test desktop and narrower layouts; the inspector is intentionally desktop-only below 800 px.

Browser testing is performed interactively. The repository does not claim a headless browser regression suite, comprehensive accessibility conformance, performance benchmarks, or tested support for every browser/platform.
