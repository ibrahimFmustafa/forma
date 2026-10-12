export interface Shape {
  id: number;
  kind: number;
  parent: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  fill: number;
  stroke: number;
  strokeWidth: number;
  radius: number;
  opacity: number;
  fontSize: number;
  fontWeight: number;
  visible: boolean;
  locked: boolean;
  name: string;
  text: string;
}
type API = Record<string, (...args: number[]) => number> & {
  memory: WebAssembly.Memory;
};
const fields = [
  "x",
  "y",
  "w",
  "h",
  "rotation",
  "fill",
  "stroke",
  "strokeWidth",
  "radius",
  "opacity",
  "fontSize",
  "fontWeight",
  "visible",
  "locked",
] as const;
export const color = (n: number) =>
  "#" + Math.round(n).toString(16).padStart(6, "0");
export const rgb = (hex: string) => parseInt(hex.replace("#", ""), 16);
export class Engine {
  api!: API;
  async init() {
    const response = await fetch(`${import.meta.env.BASE_URL}forma_core.wasm`);
    if (!response.ok)
      throw new Error(
        "The Rust engine could not be loaded. Please reload or run npm run build:engine.",
      );
    const { instance } = await WebAssembly.instantiate(
      await response.arrayBuffer(),
      {},
    );
    this.api = instance.exports as unknown as API;
  }
  nodes(): Shape[] {
    const ptr = this.api.snapshot(),
      len = this.api.output_len();
    return JSON.parse(
      new TextDecoder().decode(
        new Uint8Array(this.api.memory.buffer, ptr, len),
      ),
    );
  }
  text(id: number, slot: number, value: string) {
    if (slot === 1 && [...value].length > 16000)
      throw new Error("Text is too long (maximum 16,000 characters).");
    const bytes = new TextEncoder().encode(value);
    if (bytes.length > 65536)
      throw new Error("Text is too long (maximum 64 KB).");
    const ptr = this.api.input_alloc(bytes.length);
    new Uint8Array(this.api.memory.buffer, ptr, bytes.length).set(bytes);
    this.api.set_text(id, slot);
  }
  set(id: number, patch: Partial<Shape>) {
    for (const [key, value] of Object.entries(patch)) {
      const field = fields.indexOf(key as (typeof fields)[number]);
      if (field >= 0) this.api.set_num(id, field, Number(value));
      else if (key === "name" || key === "text")
        this.text(id, key === "name" ? 0 : 1, String(value));
    }
  }
  add(
    kind: number,
    x: number,
    y: number,
    w: number,
    h: number,
    patch: Partial<Shape> = {},
  ) {
    const id = this.api.add(kind, x, y, w, h);
    if (!id)
      throw new Error("This document has reached its 2,000 layer limit.");
    this.set(id, patch);
    return id;
  }
  transaction(fn: () => void) {
    this.api.begin();
    try {
      fn();
      this.api.commit();
    } catch (error) {
      this.api.cancel();
      throw error;
    }
  }
  load(nodes: Shape[]) {
    // Validation completes before the current document changes. Import is a single undoable transaction.
    validate(nodes);
    this.transaction(() => {
      for (const n of this.nodes().filter((n) => !n.parent))
        this.api.remove(n.id);
      const ids = new Map<number, number>();
      for (const n of nodes)
        ids.set(n.id, this.add(n.kind, n.x, n.y, n.w, n.h, n));
      for (const n of nodes)
        if (n.parent && !this.api.reparent(ids.get(n.id)!, ids.get(n.parent)!))
          throw new Error("Invalid frame hierarchy.");
    });
  }
}
export function validate(nodes: unknown): asserts nodes is Shape[] {
  if (!Array.isArray(nodes) || nodes.length > 2000)
    throw new Error("A Forma document supports up to 2,000 layers.");
  const ids = new Set<number>();
  for (const n of nodes) {
    if (
      !n ||
      !Number.isInteger(n.id) ||
      n.id <= 0 ||
      ids.has(n.id) ||
      !Number.isInteger(n.kind) ||
      n.kind < 0 ||
      n.kind > 5
    )
      throw new Error("Invalid or duplicate layer.");
    ids.add(n.id);
    for (const k of fields)
      if (
        !["visible", "locked"].includes(k) &&
        (typeof n[k] !== "number" || !Number.isFinite(n[k]))
      )
        throw new Error(`Invalid ${k}.`);
    if (
      typeof n.visible !== "boolean" ||
      typeof n.locked !== "boolean" ||
      typeof n.name !== "string" ||
      typeof n.text !== "string" ||
      [...n.name].length > 120 ||
      [...n.text].length > 16000 ||
      new TextEncoder().encode(n.text).length > 65536
    )
      throw new Error("Invalid layer content.");
    if (!Number.isInteger(n.parent) || n.parent < 0)
      throw new Error("Invalid parent.");
    if (n.kind === 5 && !/^M\s[-\d.eE+,\sL]*$/.test(n.text))
      throw new Error("Invalid drawing path.");
  }
  const map = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    const seen = new Set([n.id]);
    let p = n.parent;
    while (p) {
      const parent = map.get(p);
      if (!parent || parent.kind !== 3 || seen.has(p) || seen.size > 64)
        throw new Error(
          "Invalid, circular, or excessively deep frame hierarchy.",
        );
      seen.add(p);
      p = parent.parent;
    }
  }
}
