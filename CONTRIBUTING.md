# Contributing to Forma

Start with the README and architecture notes. Keep contributions independent: do not submit proprietary code, private protocol material, or unlicensed design assets.

Use Node 22.12+ and stable Rust with the `wasm32-unknown-unknown` target. After changing Rust, run `npm run build:engine` and include the regenerated `public/forma_core.wasm`. Run `npm test` and `npm run build`. Format Rust with `cargo fmt --manifest-path engine/Cargo.toml`; format web code with `npx prettier --write src tests scripts`.

For changes to document storage, add tests for invalid input and rollback. For scene changes, verify hierarchy, undo and export behavior together. Keep unrelated refactors out of feature patches. Describe what changed, why, how it was checked, and any remaining limits.

Open an issue before starting a large architecture change. Small bug fixes and documentation corrections are welcome directly as pull requests. Contributions are under MIT, matching the repository license.
