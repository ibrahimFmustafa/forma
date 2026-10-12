# Roadmap

This is a direction for contributions, not a delivery promise.

1. **Strengthen the editor:** byte-bounded command history, autosave recovery slots, clipboard interchange, better text metrics, path hit testing, large-scene benchmarks and keyboard accessibility.
2. **Richer graphics:** images with safe decoding, gradients, Bézier editing, boolean operations, frame clipping, grouping and multi-page documents.
3. **Design systems:** constraints, auto layout, reusable component definitions/instances, shared styles, and layout tests.
4. **Prototyping:** screen connections, interactions, presentation mode and developer measurements.
5. **Optional collaboration:** design a versioned command protocol and Rust service, then evaluate CRDT/OT approaches, authentication, access control, recovery and conflict testing. Keep local single-user use available.
6. **Packaging and reach:** internationalized interface (including RTL Arabic), improved tablet support, installable offline app and optional desktop packaging.

Each step should include a format migration plan when needed, meaningful tests, and measured performance before claims are made.
