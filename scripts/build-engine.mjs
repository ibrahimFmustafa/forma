import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
const result = spawnSync(
  "cargo",
  [
    "build",
    "--manifest-path",
    "engine/Cargo.toml",
    "--target",
    "wasm32-unknown-unknown",
    "--release",
  ],
  { stdio: "inherit" },
);
if (result.error) {
  console.error(
    "Install Rust and run: rustup target add wasm32-unknown-unknown",
  );
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);
mkdirSync("public", { recursive: true });
copyFileSync(
  "engine/target/wasm32-unknown-unknown/release/forma_core.wasm",
  "public/forma_core.wasm",
);
console.log("Built Rust engine → public/forma_core.wasm");
