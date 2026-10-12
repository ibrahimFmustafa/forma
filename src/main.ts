import "./style.css";
import { Engine, Shape, color, rgb } from "./engine";
import { demo } from "./demo";
import { icon } from "./icons";
import { artwork, box, escape, exportSVG } from "./render";

const $ = <T extends Element = HTMLElement>(s: string) =>
  document.querySelector<T>(s)!;
const app = $("#app");
const engine = new Engine();
const tools = [
  ["select", "cursor", "Move", "V"],
  ["frame", "frame", "Frame", "F"],
  ["rect", "rect", "Rectangle", "R"],
  ["ellipse", "ellipse", "Ellipse", "O"],
  ["line", "line", "Line", "L"],
  ["pen", "pen", "Draw", "P"],
  ["text", "text", "Text", "T"],
  ["hand", "hand", "Hand", "H"],
];
let nodes: Shape[] = [],
  selected = new Set<number>(),
  collapsed = new Set<number>(),
  tool = "select",
  title = "Sundays — website concept";
let zoom = 1,
  pan = { x: 60, y: 90 },
  grid = false,
  snap = false,
  space = false,
  preview = false,
  activeTab = "layers";
let saveTimer: ReturnType<typeof setTimeout>,
  toastTimer: ReturnType<typeof setTimeout>,
  autosaveOK = true;
type Point = { x: number; y: number };
type Drag = {
  type: "move" | "draw" | "pan" | "marquee" | "resize" | "pen";
  start: Point;
  last: Point;
  screen: Point;
  originals: Shape[];
  id?: number;
  handle?: string;
  b?: ReturnType<typeof box>;
  points?: Point[];
  initial?: Set<number>;
};
let drag: Drag | null = null;
let clipboard: Shape[] = [];
const iconButton = (action: string, i: string, label: string, cls = "") =>
  `<button class="icon-button ${cls}" data-action="${action}" title="${label}" aria-label="${label}">${icon(i)}</button>`;
const field = (label: string, key: string, value: number, step = 1) =>
  `<label class="field"><span>${label}</span><input aria-label="${key}" data-prop="${key}" type="number" step="${step}" value="${Math.round(value * 100) / 100}"></label>`;
const nby = (id: number) => nodes.find((n) => n.id === id);
function ancestors(id: number): number[] {
  const result: number[] = [];
  let n = nby(id);
  while (n?.parent) {
    result.push(n.parent);
    n = nby(n.parent);
  }
  return result;
}
function rootsOfSelection() {
  return nodes.filter(
    (n) =>
      selected.has(n.id) && !ancestors(n.id).some((id) => selected.has(id)),
  );
}
function effective(n: Shape) {
  return (
    n.visible &&
    !n.locked &&
    ancestors(n.id).every((id) => {
      const p = nby(id);
      return p?.visible && !p.locked;
    })
  );
}
function visible(n: Shape) {
  return n.visible && ancestors(n.id).every((id) => nby(id)?.visible);
}
function selectionNodes() {
  return nodes.filter((n) => selected.has(n.id));
}
function selectedTree() {
  return nodes
    .filter(
      (n) =>
        selected.has(n.id) || ancestors(n.id).some((id) => selected.has(id)),
    )
    .map((n) => ({
      ...n,
      parent:
        selected.has(n.parent) ||
        ancestors(n.id).some((id) => selected.has(id) && id !== n.id)
          ? n.parent
          : 0,
    }));
}
function notify(message: string) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = message;
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3200);
}
function readState() {
  nodes = engine.nodes();
  selected = new Set(
    [...selected].filter((id) => nodes.some((n) => n.id === id)),
  );
}
function refresh(persist = true) {
  readState();
  renderCanvas();
  renderLayers();
  renderInspector();
  updateStatus();
  if (persist) scheduleSave();
}
function mutate(fn: () => void) {
  try {
    engine.transaction(fn);
    refresh();
  } catch (error) {
    refresh(false);
    notify(String(error instanceof Error ? error.message : error));
  }
}
function documentData() {
  return { format: "forma", version: 1, name: title, nodes: engine.nodes() };
}
function persist() {
  try {
    localStorage.setItem("forma.document.v1", JSON.stringify(documentData()));
    autosaveOK = true;
    $(".saved").textContent = "Saved on this device";
  } catch {
    autosaveOK = false;
    $(".saved").textContent = "Save file to keep changes";
    notify(
      "Local storage is full or unavailable. Use Save file to keep your work.",
    );
  }
}
function scheduleSave() {
  clearTimeout(saveTimer);
  $(".saved").textContent = "Saving…";
  saveTimer = setTimeout(persist, 350);
}
function setTool(next: string) {
  if (drag) abortDrag();
  tool = next;
  document.querySelectorAll("[data-tool]").forEach((el) => {
    el.classList.toggle("active", el.getAttribute("data-tool") === tool);
    el.setAttribute(
      "aria-pressed",
      String(el.getAttribute("data-tool") === tool),
    );
  });
  $("#canvas").setAttribute(
    "style",
    `cursor:${tool === "hand" ? "grab" : tool === "select" ? "default" : tool === "text" ? "text" : "crosshair"}`,
  );
  updateStatus();
}
function updateStatus() {
  const count = selected.size;
  $("#selection-status").textContent = count
    ? `${count} layer${count === 1 ? "" : "s"} selected`
    : "Nothing selected";
  $("#layer-count").textContent = `${nodes.length} layers`;
  $("#tool-status").textContent =
    tools.find((t) => t[0] === tool)?.[2] || "Move";
  $('[data-action="undo"]').toggleAttribute(
    "disabled",
    !engine.api.history_count(0),
  );
  $('[data-action="redo"]').toggleAttribute(
    "disabled",
    !engine.api.history_count(1),
  );
  $(".zoom-label").textContent = `${Math.round(zoom * 100)}%`;
  $("#snap-status").textContent = snap ? "Snap 8 px" : "Snap off";
}
function renderCanvas() {
  const labels = nodes
    .filter((n) => n.kind === 3 && !n.parent && n.visible)
    .map(
      (n) =>
        `<text class="artboard-label" x="${n.x}" y="${n.y - 12 / zoom}" style="font-size:${10 / zoom}px">${escape(n.name)}</text>`,
    )
    .join("");
  $("#scene").innerHTML = labels + artwork(nodes);
  $("#viewport").setAttribute(
    "transform",
    `translate(${pan.x} ${pan.y}) scale(${zoom})`,
  );
  renderSelection();
  updateStatus();
}
function renderSelection() {
  let svg = "";
  const selectedNodes = selectionNodes().filter((n) => visible(n));
  if (selectedNodes.length && !preview) {
    const b = box(selectedNodes),
      size = 7 / zoom;
    svg = `<rect class="selection-box" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>`;
    const resize = selectedNodes.every((n) => effective(n) && n.rotation === 0);
    if (resize)
      for (const [h, x, y] of [
        ["nw", b.x, b.y],
        ["ne", b.x + b.w, b.y],
        ["se", b.x + b.w, b.y + b.h],
        ["sw", b.x, b.y + b.h],
      ] as [string, number, number][])
        svg += `<rect data-handle="${h}" class="selection-handle" x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" style="cursor:${h}-resize"/>`;
    svg += `<g transform="translate(${b.x + b.w / 2} ${b.y + b.h + 19 / zoom}) scale(${1 / zoom})"><rect x="-36" y="-10" width="72" height="19" rx="4" fill="#839b55"/><text text-anchor="middle" fill="white" font-size="9" y="3" font-family="Arial">${Math.round(b.w)} × ${Math.round(b.h)}</text></g>`;
  }
  if (drag?.type === "marquee") {
    const a = drag.start,
      b = drag.last;
    svg += `<rect class="marquee" x="${Math.min(a.x, b.x)}" y="${Math.min(a.y, b.y)}" width="${Math.abs(a.x - b.x)}" height="${Math.abs(a.y - b.y)}"/>`;
  }
  $("#selection").innerHTML = svg;
}
function renderLayers() {
  if (activeTab !== "layers") return;
  const tree = (parent: number, depth: number): string =>
    nodes
      .filter((n) => n.parent === parent)
      .reverse()
      .map((n) => {
        const hasChildren = nodes.some((c) => c.parent === n.id);
        return `<div class="layer-row ${selected.has(n.id) ? "selected" : ""} ${n.visible ? "" : "hidden-layer"}" data-layer-row="${n.id}" style="padding-left:${depth * 13 + 3}px" role="treeitem" aria-selected="${selected.has(n.id)}" ${hasChildren ? `aria-expanded="${!collapsed.has(n.id)}"` : ""}>
      <button class="collapse ${collapsed.has(n.id) ? "" : "open"}" data-collapse="${n.id}" aria-label="${collapsed.has(n.id) ? "Expand" : "Collapse"} ${escape(n.name)}">${hasChildren ? icon("chevron", 12) : ""}</button>
      <span class="layer-icon">${icon(["rect", "ellipse", "text", "frame", "line", "pen"][n.kind], 14)}</span><button class="layer-name" data-select-layer="${n.id}" title="${escape(n.name)}">${escape(n.name)}</button>
      <button class="layer-action ${n.locked ? "set" : ""}" data-lock="${n.id}" aria-label="${n.locked ? "Unlock" : "Lock"} ${escape(n.name)}">${icon(n.locked ? "lock" : "unlock", 12)}</button>
      <button class="layer-action ${n.visible ? "" : "set"}" data-visible="${n.id}" aria-label="${n.visible ? "Hide" : "Show"} ${escape(n.name)}">${icon(n.visible ? "eye" : "hidden", 12)}</button></div>${hasChildren && !collapsed.has(n.id) ? tree(n.id, depth + 1) : ""}`;
      })
      .join("");
  $("#left-content").innerHTML =
    `<div class="section-heading">PAGES <span>01</span></div><div class="page-row">${icon("frame", 13)} Design exploration <small>1</small></div><div class="section-heading" style="border-top:1px solid var(--line)">LAYERS <span>${nodes.length}</span></div><div class="layer-tree" role="tree" aria-label="Layers">${tree(0, 0) || '<p class="inspector-note" style="padding:10px">Your ideas start here. Draw a shape or add a frame.</p>'}</div>`;
}
function renderAssets() {
  $("#left-content").innerHTML =
    `<div class="assets"><div class="inspect-heading">A few starting points ${icon("spark", 14)}</div><p class="inspector-note">Original, editable building blocks. Click to add to your canvas.</p><button class="asset" data-asset="button"><div class="asset-preview"><span>Get started →</span></div>Rounded button <small>Shape + text</small></button><button class="asset" data-asset="card"><div class="asset-preview">${icon("layers", 32)}</div>Content card <small>Frame + typography</small></button><button class="asset" data-asset="phone"><div class="asset-preview">${icon("frame", 32)}</div>Mobile frame <small>390 × 844</small></button><button class="asset" data-asset="desktop"><div class="asset-preview">${icon("frame", 32)}</div>Desktop frame <small>1440 × 900</small></button></div>`;
}
function renderInspector() {
  const chosen = selectionNodes(),
    n = chosen[0];
  if (!n) {
    $("#inspector").innerHTML =
      `<div class="inspect-section"><div class="inspect-heading">CANVAS <span class="inspect-sub">LOCAL WORKSPACE</span></div><div class="empty-icon">${icon("spark", 27)}</div><div class="empty-title">A little space.<br>Endless possibilities.</div><p class="empty-description">Select a layer to make it yours, or pick a tool and start something new.</p></div><div class="inspect-section"><div class="inspect-heading">Quick start</div>${[
        ["Move / select", "V"],
        ["Frame", "F"],
        ["Rectangle", "R"],
        ["Text", "T"],
        ["Zoom to fit", "Shift 1"],
      ]
        .map(
          ([name, key]) =>
            `<div class="shortcut-row">${name}<kbd>${key}</kbd></div>`,
        )
        .join(
          "",
        )}</div><div class="inspect-section"><div class="inspect-heading">Made to be yours ${icon("code", 14)}</div><p class="inspector-note">Open source. Powered by Rust.<br>Your files stay on your device.</p><button class="button" data-action="help">${icon("help", 14)} Keyboard shortcuts</button></div>`;
    return;
  }
  const b = box(chosen),
    multi = chosen.length > 1;
  $("#inspector").innerHTML =
    `<div class="inspect-section"><div class="inspect-heading"><span class="selection-name">${multi ? `${chosen.length} layers` : escape(n.name)}</span>${icon(["rect", "ellipse", "text", "frame", "line", "pen"][n.kind], 15)}</div>${!multi ? `<input class="wide-input" data-name aria-label="Layer name" value="${escape(n.name)}">` : '<p class="inspector-note">Shared appearance applies to all selected layers.</p>'}</div>
    <div class="inspect-section"><div class="align-buttons">${["left", "center", "right", "top", "middle", "bottom"].map((a) => `<button data-align="${a}" title="Align ${a}" aria-label="Align ${a}">${icon(a, 16)}</button>`).join("")}</div><div class="inspect-heading">Layout <span class="inspect-sub">${multi ? "SELECTION" : "ABSOLUTE"}</span></div><div class="field-grid">${field("X", "x", multi ? b.x : n.x)}${field("Y", "y", multi ? b.y : n.y)}${field("W", "w", multi ? b.w : n.w)}${field("H", "h", multi ? b.h : n.h)}${!multi && n.kind !== 3 ? field("↻", "rotation", n.rotation) : ""}${!multi && (n.kind === 0 || n.kind === 3) ? field("⌜", "radius", n.radius) : ""}</div>${
      !multi
        ? `<div style="margin-top:12px"><div class="inspect-heading">Parent frame</div><select aria-label="Parent frame" data-parent><option value="0">Canvas</option>${nodes
            .filter(
              (p) =>
                p.kind === 3 &&
                p.id !== n.id &&
                !ancestors(p.id).includes(n.id),
            )
            .map(
              (p) =>
                `<option value="${p.id}" ${n.parent === p.id ? "selected" : ""}>${escape(p.name)}</option>`,
            )
            .join("")}</select></div>`
        : ""
    }</div>
    ${!multi && n.kind === 2 ? `<div class="inspect-section"><div class="inspect-heading">Typography <span class="inspect-sub">ARIAL</span></div><textarea class="wide-input" data-text aria-label="Text content" rows="4">${escape(n.text)}</textarea><div class="field-grid" style="margin-top:9px">${field("Aa", "fontSize", n.fontSize)}${field("B", "fontWeight", n.fontWeight, 100)}</div></div>` : ""}
    <div class="inspect-section"><div class="inspect-heading">Fill <span class="inspect-sub">SOLID</span></div><div class="color-row"><input type="color" data-color="fill" aria-label="Fill color" value="${color(n.fill)}"><span class="hex">${color(n.fill).slice(1).toUpperCase()}</span><span class="color-opacity">${Math.round(n.opacity * 100)}%</span></div><div class="swatches">${["#31462e", "#a6bb77", "#e3e9ce", "#f0ba78", "#faf9f5", "#252824"].map((c) => `<button class="swatch" data-swatch="${c}" title="Fill ${c}" aria-label="Fill ${c}" style="background:${c}"></button>`).join("")}</div><div class="field-grid" style="margin-top:14px">${field("◐", "opacity", n.opacity, 0.05)}</div></div>
    <div class="inspect-section"><div class="inspect-heading">Stroke</div><div class="color-row"><input type="color" data-color="stroke" aria-label="Stroke color" value="${color(n.stroke)}"><span class="hex">${color(n.stroke).slice(1).toUpperCase()}</span></div><div class="field-grid" style="margin-top:9px">${field("px", "strokeWidth", n.strokeWidth)}</div></div>
    <div class="inspect-section"><div class="inspect-heading">Arrange</div><div class="field-grid"><button class="button" data-action="back">${icon("down", 13)} Backward</button><button class="button" data-action="front">${icon("up", 13)} Forward</button></div><button class="button" data-action="duplicate">${icon("copy", 13)} Duplicate</button><button class="button" data-action="export-selection">${icon("download", 13)} Export selection as SVG</button><button class="button danger" data-action="delete">${icon("trash", 13)} Delete selection</button></div>`;
}
function world(e: PointerEvent | WheelEvent): Point {
  const r = $("#canvas").getBoundingClientRect();
  return {
    x: (e.clientX - r.left - pan.x) / zoom,
    y: (e.clientY - r.top - pan.y) / zoom,
  };
}
function quant(v: number) {
  return snap ? Math.round(v / 8) * 8 : v;
}
function fit(selection = false) {
  const list =
    selection && selected.size
      ? selectionNodes()
      : nodes.filter((n) => visible(n));
  const b = box(list),
    r = $("#canvas").getBoundingClientRect();
  zoom = Math.min(
    1.25,
    Math.max(
      0.05,
      Math.min(
        (r.width - 100) / Math.max(1, b.w),
        (r.height - 155) / Math.max(1, b.h),
      ),
    ),
  );
  pan = {
    x: (r.width - b.w * zoom) / 2 - b.x * zoom,
    y: (r.height - 60 - b.h * zoom) / 2 - b.y * zoom,
  };
  renderCanvas();
}
function changeZoom(factor: number, anchor?: Point) {
  const r = $("#canvas").getBoundingClientRect();
  const at = anchor || { x: r.width / 2, y: r.height / 2 };
  const next = Math.max(0.05, Math.min(8, zoom * factor));
  pan = {
    x: at.x - ((at.x - pan.x) * next) / zoom,
    y: at.y - ((at.y - pan.y) * next) / zoom,
  };
  zoom = next;
  renderCanvas();
}
function resizeShapes(
  originals: Shape[],
  from: ReturnType<typeof box>,
  to: ReturnType<typeof box>,
) {
  const sx = to.w / Math.max(1, from.w),
    sy = to.h / Math.max(1, from.h);
  // Parent-first absolute positions compensate for the engine's descendant translation.
  for (const n of [...originals].sort(
    (a, b) => ancestors(a.id).length - ancestors(b.id).length,
  )) {
    engine.set(n.id, {
      x: to.x + (n.x - from.x) * sx,
      y: to.y + (n.y - from.y) * sy,
      w: n.w * sx,
      h: n.h * sy,
      ...(n.kind === 2 ? { fontSize: n.fontSize * Math.min(sx, sy) } : {}),
    });
  }
}
function beginPointer(e: PointerEvent) {
  if (preview || e.button > 1) return;
  e.preventDefault();
  $("#canvas").setPointerCapture(e.pointerId);
  const p = world(e),
    screen = { x: e.clientX, y: e.clientY },
    handle = (e.target as Element).getAttribute("data-handle");
  if (tool === "hand" || space || e.button === 1) {
    drag = { type: "pan", start: p, last: p, screen, originals: [] };
    return;
  }
  if (handle && selected.size) {
    const originals = nodes
      .filter(
        (n) =>
          selected.has(n.id) || ancestors(n.id).some((id) => selected.has(id)),
      )
      .map((n) => ({ ...n }));
    engine.api.begin();
    drag = {
      type: "resize",
      start: p,
      last: p,
      screen,
      originals,
      handle,
      b: box(selectionNodes()),
    };
    return;
  }
  if (tool === "select") {
    let hit = engine.api.hit_test(p.x, p.y);
    if (hit) {
      if (e.shiftKey) {
        selected.has(hit) ? selected.delete(hit) : selected.add(hit);
      } else if (!selected.has(hit)) selected = new Set([hit]);
      const roots = rootsOfSelection().filter((n) => effective(n));
      engine.api.begin();
      drag = {
        type: "move",
        start: p,
        last: p,
        screen,
        originals: roots.map((n) => ({ ...n })),
      };
    } else {
      const initial = e.shiftKey ? new Set(selected) : new Set<number>();
      if (!e.shiftKey) selected.clear();
      drag = {
        type: "marquee",
        start: p,
        last: p,
        screen,
        originals: [],
        initial,
      };
    }
    refresh(false);
    return;
  }
  const kinds: Record<string, number> = {
      rect: 0,
      ellipse: 1,
      text: 2,
      frame: 3,
      line: 4,
      pen: 5,
    },
    kind = kinds[tool];
  if (kind === undefined) return;
  try {
    engine.api.begin();
    const id = engine.add(
      kind,
      quant(p.x),
      quant(p.y),
      kind === 2 ? 200 : 1,
      kind === 2 ? 34 : 1,
      {
        ...(kind === 3 ? { fill: rgb("#ffffff") } : {}),
        ...(kind === 5 ? { text: "M 0 0 L 1 1" } : {}),
      },
    );
    // Put newly drawn content in the deepest frame under the pointer.
    const parent = nodes
      .filter(
        (n) =>
          n.kind === 3 &&
          effective(n) &&
          p.x >= n.x &&
          p.x <= n.x + n.w &&
          p.y >= n.y &&
          p.y <= n.y + n.h,
      )
      .sort((a, b) => ancestors(b.id).length - ancestors(a.id).length)[0];
    if (parent && kind !== 3) engine.api.reparent(id, parent.id);
    selected = new Set([id]);
    if (kind === 2) {
      engine.api.commit();
      setTool("select");
      refresh();
      queueMicrotask(() => {
        $<HTMLTextAreaElement>("[data-text]").focus();
        $<HTMLTextAreaElement>("[data-text]").select();
      });
      return;
    }
    drag = {
      type: kind === 5 ? "pen" : "draw",
      start: { x: quant(p.x), y: quant(p.y) },
      last: p,
      screen,
      originals: [],
      id,
      points: [p],
    };
    refresh(false);
  } catch (error) {
    engine.api.cancel();
    notify(String(error));
  }
}
function movePointer(e: PointerEvent) {
  if (!drag) return;
  const p = world(e),
    d = drag;
  if (
    d.type === "move" &&
    Math.hypot(e.clientX - d.screen.x, e.clientY - d.screen.y) < 3 &&
    d.last === d.start
  )
    return;
  if (d.type === "pan") {
    pan.x += e.clientX - d.screen.x;
    pan.y += e.clientY - d.screen.y;
    d.screen = { x: e.clientX, y: e.clientY };
    renderCanvas();
    return;
  }
  if (d.type === "move") {
    const dx = quant(p.x - d.start.x),
      dy = quant(p.y - d.start.y);
    for (const n of d.originals) engine.set(n.id, { x: n.x + dx, y: n.y + dy });
    readState();
    renderCanvas();
  }
  if (d.type === "draw") {
    let dx = quant(p.x) - d.start.x,
      dy = quant(p.y) - d.start.y;
    if (e.shiftKey) {
      const size = Math.max(Math.abs(dx), Math.abs(dy));
      dx = Math.sign(dx || 1) * size;
      dy = Math.sign(dy || 1) * size;
    }
    const n = nby(d.id!)!;
    if (n.kind === 4) {
      const len = Math.max(1, Math.hypot(dx, dy));
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      engine.set(n.id, {
        x: (d.start.x + p.x) / 2 - len / 2,
        y: (d.start.y + p.y) / 2 - 0.5,
        w: len,
        h: 1,
        rotation: angle - (Math.atan2(1, len) * 180) / Math.PI,
      });
    } else
      engine.set(d.id!, {
        x: Math.min(d.start.x, d.start.x + dx),
        y: Math.min(d.start.y, d.start.y + dy),
        w: Math.max(1, Math.abs(dx)),
        h: Math.max(1, Math.abs(dy)),
      });
    readState();
    renderCanvas();
  }
  if (d.type === "pen") {
    const points = d.points!;
    if (
      Math.hypot(
        p.x - points[points.length - 1].x,
        p.y - points[points.length - 1].y,
      ) <
      2 / zoom
    )
      return;
    if (points.length >= 600) return;
    points.push(p);
    const x = Math.min(...points.map((p) => p.x)),
      y = Math.min(...points.map((p) => p.y)),
      w = Math.max(1, Math.max(...points.map((p) => p.x)) - x),
      h = Math.max(1, Math.max(...points.map((p) => p.y)) - y);
    const path = points
      .map(
        (p, i) =>
          `${i ? "L" : "M"} ${Math.round(((p.x - x) / w) * 1000)} ${Math.round(((p.y - y) / h) * 1000)}`,
      )
      .join(" ");
    engine.set(d.id!, { x, y, w, h, text: path });
    readState();
    renderCanvas();
  }
  if (d.type === "resize") {
    const b = d.b!,
      h = d.handle!;
    let x = b.x,
      y = b.y,
      w = b.w,
      height = b.h;
    if (h.includes("w")) {
      x = Math.min(quant(p.x), b.x + b.w - 1);
      w = b.x + b.w - x;
    } else w = Math.max(1, quant(p.x) - b.x);
    if (h.includes("n")) {
      y = Math.min(quant(p.y), b.y + b.h - 1);
      height = b.y + b.h - y;
    } else height = Math.max(1, quant(p.y) - b.y);
    if (e.shiftKey) {
      const ratio = b.w / b.h;
      height = w / ratio;
      if (h.includes("n")) y = b.y + b.h - height;
    }
    resizeShapes(d.originals, b, { x, y, w, h: height });
    readState();
    renderCanvas();
  }
  d.last = p;
  if (d.type === "marquee") {
    const x = Math.min(p.x, d.start.x),
      y = Math.min(p.y, d.start.y),
      right = Math.max(p.x, d.start.x),
      bottom = Math.max(p.y, d.start.y);
    selected = new Set(d.initial);
    for (const n of nodes.filter((n) => effective(n) && n.kind !== 3)) {
      const b = box([n]);
      if (b.x >= x && b.y >= y && b.x + b.w <= right && b.y + b.h <= bottom)
        selected.add(n.id);
    }
    renderSelection();
  }
}
function endPointer() {
  if (!drag) return;
  const d = drag;
  if (d.type === "draw") {
    const n = nby(d.id!);
    if (n && n.w < 3 && n.h < 3)
      engine.set(n.id, {
        w: n.kind === 3 ? 390 : 120,
        h: n.kind === 3 ? 844 : 100,
      });
  }
  if (["move", "draw", "pen", "resize"].includes(d.type)) engine.api.commit();
  drag = null;
  if (d.type === "draw" || d.type === "pen") setTool("select");
  refresh(d.type !== "pan" && d.type !== "marquee");
}
function abortDrag() {
  if (!drag) return;
  if (["move", "draw", "pen", "resize"].includes(drag.type))
    engine.api.cancel();
  drag = null;
  refresh(false);
}
function align(action: string) {
  const chosen = rootsOfSelection().filter(effective);
  if (!chosen.length) return;
  const b =
    chosen.length === 1
      ? nby(chosen[0].parent) || box(nodes.filter((n) => !n.parent))
      : box(chosen);
  mutate(() => {
    for (const n of chosen) {
      const q = box([n]);
      let dx = 0,
        dy = 0;
      if (action === "left") dx = b.x - q.x;
      if (action === "center") dx = b.x + b.w / 2 - q.x - q.w / 2;
      if (action === "right") dx = b.x + b.w - q.x - q.w;
      if (action === "top") dy = b.y - q.y;
      if (action === "middle") dy = b.y + b.h / 2 - q.y - q.h / 2;
      if (action === "bottom") dy = b.y + b.h - q.y - q.h;
      engine.api.translate(n.id, dx, dy);
    }
  });
}
function setProperty(key: string, value: number) {
  if (!Number.isFinite(value)) return;
  const chosen = selectionNodes().filter(effective);
  if (!chosen.length) {
    notify("Unlock the layer before editing.");
    renderInspector();
    return;
  }
  if (chosen.length > 1 && ["x", "y", "w", "h"].includes(key)) {
    const b = box(chosen);
    const to = {
      ...b,
      [key]: ["w", "h"].includes(key) ? Math.max(1, value) : value,
    };
    const original = nodes.filter(
      (n) =>
        selected.has(n.id) || ancestors(n.id).some((id) => selected.has(id)),
    );
    mutate(() => resizeShapes(original, b, to));
  } else
    mutate(() => {
      for (const n of chosen) engine.set(n.id, { [key]: value });
    });
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function filename() {
  return (title.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "Untitled").slice(
    0,
    80,
  );
}
async function exportFile(type: string, selection = false) {
  if (type === "forma") {
    download(
      new Blob([JSON.stringify(documentData(), null, 2)], {
        type: "application/json",
      }),
      filename() + ".forma",
    );
    notify("Forma file saved");
    return;
  }
  const list = selection ? selectedTree() : nodes;
  if (!list.length) {
    notify("Add a layer before exporting.");
    return;
  }
  const { svg, w, h } = exportSVG(list);
  if (type === "svg") {
    download(new Blob([svg], { type: "image/svg+xml" }), filename() + ".svg");
    notify("SVG exported");
    return;
  }
  const scale = Math.min(
    2,
    8192 / w,
    8192 / h,
    Math.sqrt(24_000_000 / (w * h)),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("PNG conversion failed.");
    download(blob, filename() + ".png");
    notify(`PNG exported · ${canvas.width} × ${canvas.height}`);
  } catch {
    notify("PNG export failed. Try SVG instead.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
function menu() {
  document.querySelector(".popover")?.remove();
  const el = document.createElement("div");
  el.className = "popover";
  el.innerHTML = `<div class="popover-label">Take your ideas with you</div><button data-action="save">${icon("save", 16)} Save Forma file <span>Ctrl S</span></button><button data-action="svg">${icon("code", 16)} Export SVG <span>VECTOR</span></button><button data-action="png">${icon("download", 16)} Export PNG <span>2×</span></button><div class="popover-label">Workspace</div><button data-action="open">${icon("folder", 16)} Open Forma file <span>Ctrl O</span></button><button data-action="new">${icon("plus", 16)} New document</button>`;
  document.body.append(el);
}
function modal(title: string, body: string) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-label="${escape(title)}"><div class="modal-header"><h2>${title}</h2>${iconButton("close-modal", "close", "Close dialog")}</div>${body}</section>`;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.append(overlay);
  overlay.querySelector<HTMLButtonElement>("button")?.focus();
}
function help() {
  modal(
    "Room for your next idea.",
    `<p>Forma is an independent, open-source design canvas. Your work is saved in this browser. Download a <strong>.forma</strong> file to back it up or move between devices.</p><div class="shortcut-grid">${[
      ["Move / select", "V"],
      ["Draw rectangle", "R"],
      ["Draw ellipse", "O"],
      ["Add text", "T"],
      ["Create frame", "F"],
      ["Draw a line", "L"],
      ["Freehand drawing", "P"],
      ["Pan canvas", "Space + drag"],
      ["Zoom", "Ctrl + wheel"],
      ["Select multiple", "Shift + click"],
      ["Undo / redo", "Ctrl Z / Ctrl Shift Z"],
      ["Duplicate", "Ctrl D"],
      ["Copy / paste", "Ctrl C / Ctrl V"],
      ["Nudge / large nudge", "Arrow / Shift Arrow"],
      ["Fit canvas / selection", "Shift 1 / Shift 2"],
      ["Save / open", "Ctrl S / Ctrl O"],
      ["Delete layer", "Delete"],
      ["Cancel / deselect", "Esc"],
    ]
      .map(
        ([name, key]) =>
          `<div class="shortcut-row">${name}<kbd>${key}</kbd></div>`,
      )
      .join(
        "",
      )}</div><p>Draw with Shift to constrain proportions. Double-click text to edit. Resize unrotated selections using their corner handles. Use the inspector for rotation and exact values.</p><div class="modal-foot">Forma 0.1 · MIT license · Rust + WebAssembly · No account required<br>Single-user alpha. No live collaboration, .fig import, or linked components yet.</div>`,
  );
}
function addAsset(type: string) {
  const r = $("#canvas").getBoundingClientRect(),
    x = (r.width / 2 - pan.x) / zoom,
    y = (r.height / 2 - pan.y) / zoom;
  mutate(() => {
    let id = 0;
    if (type === "phone" || type === "desktop")
      id = engine.add(
        3,
        x - 100,
        y - 100,
        type === "phone" ? 390 : 1440,
        type === "phone" ? 844 : 900,
        {
          fill: rgb("#ffffff"),
          name: type === "phone" ? "Mobile / 390" : "Desktop / 1440",
        },
      );
    else {
      id = engine.add(
        3,
        x - 100,
        y - 60,
        type === "button" ? 180 : 300,
        type === "button" ? 52 : 230,
        {
          fill: rgb(type === "button" ? "#415d33" : "#ffffff"),
          radius: type === "button" ? 26 : 16,
          name: type === "button" ? "Button" : "Content card",
        },
      );
      const t = engine.add(2, x - 76, y - 42, 240, 45, {
        text: type === "button" ? "Get started →" : "A fresh perspective",
        fontSize: type === "button" ? 14 : 21,
        fontWeight: 600,
        fill: rgb(type === "button" ? "#ffffff" : "#31462e"),
      });
      engine.api.reparent(t, id);
      if (type === "card") {
        const body = engine.add(2, x - 76, y + 10, 255, 90, {
          text: "Make a little room for your next idea.\nStart here, then make it your own.",
          fontSize: 13,
          fill: rgb("#89947c"),
        });
        engine.api.reparent(body, id);
      }
    }
    selected = new Set([id]);
  });
  setTool("select");
  fit(true);
}
function paste() {
  if (!clipboard.length) return;
  mutate(() => {
    const ids = new Map<number, number>();
    for (const n of clipboard)
      ids.set(
        n.id,
        engine.add(n.kind, n.x + 24, n.y + 24, n.w, n.h, {
          ...n,
          x: n.x + 24,
          y: n.y + 24,
        }),
      );
    for (const n of clipboard)
      if (n.parent && ids.has(n.parent))
        engine.api.reparent(ids.get(n.id)!, ids.get(n.parent)!);
    selected = new Set(
      clipboard.filter((n) => !n.parent).map((n) => ids.get(n.id)!),
    );
    clipboard = clipboard.map((n) => ({ ...n, x: n.x + 24, y: n.y + 24 }));
  });
}
function action(a: string) {
  document.querySelector(".popover")?.remove();
  if (a === "undo" || a === "redo") {
    engine.api[a]();
    refresh();
  } else if (a === "zoom-in") changeZoom(1.2);
  else if (a === "zoom-out") changeZoom(1 / 1.2);
  else if (a === "fit") fit();
  else if (a === "grid") {
    grid = !grid;
    $(".canvas-wrap").classList.toggle("grid", grid);
    $('[data-action="grid"]').setAttribute("aria-pressed", String(grid));
  } else if (a === "snap") {
    snap = !snap;
    notify(snap ? "Snap to 8 px grid enabled" : "Grid snapping disabled");
    updateStatus();
  } else if (a === "duplicate")
    mutate(() => {
      selected = new Set(
        rootsOfSelection()
          .filter(effective)
          .map((n) => engine.api.duplicate(n.id))
          .filter(Boolean),
      );
    });
  else if (a === "delete")
    mutate(() => {
      for (const n of rootsOfSelection().filter(effective))
        engine.api.remove(n.id);
      selected.clear();
    });
  else if (a === "front" || a === "back")
    mutate(() => {
      for (const n of rootsOfSelection().filter(effective))
        engine.api.reorder(n.id, a === "front" ? 1 : -1);
    });
  else if (a === "export") menu();
  else if (a === "save") void exportFile("forma");
  else if (a === "svg" || a === "png") void exportFile(a);
  else if (a === "export-selection") void exportFile("svg", true);
  else if (a === "open") $<HTMLInputElement>("#file-input").click();
  else if (a === "help") help();
  else if (a === "new")
    modal(
      "Start a fresh canvas?",
      `<p>Download your current document first if you want to keep a separate copy. The new document will replace this browser’s autosave.</p><div style="display:flex;gap:10px;margin-top:24px"><button class="button" data-action="save">${icon("save", 15)} Save current file</button><button class="button primary" data-action="new-confirm">Create new document</button></div>`,
    );
  else if (a === "new-confirm") {
    engine.transaction(() => {
      for (const n of nodes.filter((n) => !n.parent)) engine.api.remove(n.id);
    });
    title = "Untitled design";
    $<HTMLInputElement>(".file-title").value = title;
    selected.clear();
    document.querySelector(".modal-overlay")?.remove();
    refresh();
    fit();
  } else if (a === "close-modal")
    document.querySelector(".modal-overlay")?.remove();
  else if (a === "preview") {
    preview = !preview;
    $(".app").classList.toggle("preview-mode", preview);
    $('[data-action="preview"]').innerHTML = icon(preview ? "close" : "play");
    $('[data-action="preview"]').setAttribute(
      "aria-label",
      preview ? "Exit preview" : "Preview design",
    );
    requestAnimationFrame(() => fit());
  }
}
function bind() {
  document.addEventListener("click", (e) => {
    const el = e.target as Element;
    const button = el.closest<HTMLElement>("[data-action]");
    if (button) {
      action(button.dataset.action!);
      return;
    }
    if (!el.closest(".popover")) document.querySelector(".popover")?.remove();
    const t = el.closest<HTMLElement>("[data-tool]");
    if (t) {
      setTool(t.dataset.tool!);
      return;
    }
    const tab = el.closest<HTMLElement>("[data-tab]");
    if (tab) {
      activeTab = tab.dataset.tab!;
      document
        .querySelectorAll("[data-tab]")
        .forEach((x) => x.classList.toggle("active", x === tab));
      activeTab === "layers" ? renderLayers() : renderAssets();
      return;
    }
    const layer = el.closest<HTMLElement>("[data-select-layer]");
    if (layer) {
      const id = Number(layer.dataset.selectLayer);
      if ((e as MouseEvent).shiftKey)
        selected.has(id) ? selected.delete(id) : selected.add(id);
      else selected = new Set([id]);
      refresh(false);
      return;
    }
    const collapse = el.closest<HTMLElement>("[data-collapse]");
    if (collapse) {
      const id = Number(collapse.dataset.collapse);
      collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
      renderLayers();
      return;
    }
    const lock = el.closest<HTMLElement>("[data-lock]");
    if (lock) {
      const id = Number(lock.dataset.lock);
      mutate(() => engine.set(id, { locked: !nby(id)!.locked }));
      return;
    }
    const visibility = el.closest<HTMLElement>("[data-visible]");
    if (visibility) {
      const id = Number(visibility.dataset.visible);
      mutate(() => engine.set(id, { visible: !nby(id)!.visible }));
      return;
    }
    const alignButton = el.closest<HTMLElement>("[data-align]");
    if (alignButton) {
      align(alignButton.dataset.align!);
      return;
    }
    const swatch = el.closest<HTMLElement>("[data-swatch]");
    if (swatch) {
      setProperty("fill", rgb(swatch.dataset.swatch!));
      return;
    }
    const asset = el.closest<HTMLElement>("[data-asset]");
    if (asset) addAsset(asset.dataset.asset!);
  });
  document.addEventListener("change", (e) => {
    const el = e.target as HTMLInputElement;
    if (el.dataset.prop) setProperty(el.dataset.prop, Number(el.value));
    if (el.dataset.color) setProperty(el.dataset.color, rgb(el.value));
    if (el.hasAttribute("data-name")) {
      const n = selectionNodes()[0];
      if (n) mutate(() => engine.text(n.id, 0, el.value));
    }
    if (el.hasAttribute("data-text")) {
      const n = selectionNodes()[0];
      if (n && effective(n)) mutate(() => engine.text(n.id, 1, el.value));
    }
    if (el.hasAttribute("data-parent")) {
      const n = selectionNodes()[0];
      if (n && effective(n))
        mutate(() => {
          if (!engine.api.reparent(n.id, Number(el.value)))
            throw new Error("This frame relationship is not allowed.");
        });
    }
    if (el.classList.contains("file-title")) {
      title = el.value.trim().slice(0, 100) || "Untitled design";
      el.value = title;
      scheduleSave();
    }
  });
  const canvas = $<SVGSVGElement>("#canvas");
  canvas.addEventListener("pointerdown", beginPointer);
  canvas.addEventListener("pointermove", movePointer);
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", abortDrag);
  canvas.addEventListener("lostpointercapture", () => {
    if (drag) endPointer();
  });
  canvas.addEventListener("dblclick", (e) => {
    const p = world(e as unknown as PointerEvent),
      n = nby(engine.api.hit_test(p.x, p.y));
    if (n?.kind === 2) {
      selected = new Set([n.id]);
      refresh(false);
      $<HTMLTextAreaElement>("[data-text]").focus();
      $<HTMLTextAreaElement>("[data-text]").select();
    }
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = canvas.getBoundingClientRect();
        changeZoom(Math.exp(-e.deltaY * 0.002), {
          x: e.clientX - r.left,
          y: e.clientY - r.top,
        });
      } else {
        pan.x -= e.deltaX;
        pan.y -= e.deltaY;
        renderCanvas();
      }
    },
    { passive: false },
  );
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement,
      editing =
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable,
      cmd = e.ctrlKey || e.metaKey;
    if (e.key === "Escape") {
      if (drag) abortDrag();
      else if (document.querySelector(".modal-overlay"))
        document.querySelector(".modal-overlay")?.remove();
      else if (preview) action("preview");
      else {
        selected.clear();
        setTool("select");
        refresh(false);
      }
      document.querySelector(".popover")?.remove();
      return;
    }
    if (cmd && e.key.toLowerCase() === "s") {
      e.preventDefault();
      (target as HTMLElement).blur();
      action("save");
      return;
    }
    if (editing) return;
    if (document.querySelector(".modal-overlay")) return;
    if (cmd) {
      const key = e.key.toLowerCase();
      if (["s", "o", "z", "y", "d", "a", "c", "v", "x"].includes(key))
        e.preventDefault();
      if (key === "s") action("save");
      if (key === "o") action("open");
      if (key === "z") action(e.shiftKey ? "redo" : "undo");
      if (key === "y") action("redo");
      if (key === "d") action("duplicate");
      if (key === "a") {
        selected = new Set(
          nodes.filter((n) => !n.parent && effective(n)).map((n) => n.id),
        );
        refresh(false);
      }
      if (key === "c" || key === "x") {
        clipboard = selectedTree();
        notify(`${selected.size} layers copied`);
        if (key === "x") action("delete");
      }
      if (key === "v") paste();
      return;
    }
    if (preview) return;
    if (e.key === " ") {
      e.preventDefault();
      space = true;
      canvas.style.cursor = "grab";
      return;
    }
    if (e.shiftKey && e.code === "Digit1") {
      e.preventDefault();
      fit();
      return;
    }
    if (e.shiftKey && e.code === "Digit2") {
      e.preventDefault();
      fit(true);
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      action("delete");
      return;
    }
    if (e.key.startsWith("Arrow") && selected.size) {
      e.preventDefault();
      const amount = e.shiftKey ? 10 : 1;
      mutate(() => {
        for (const n of rootsOfSelection().filter(effective))
          engine.api.translate(
            n.id,
            e.key === "ArrowLeft"
              ? -amount
              : e.key === "ArrowRight"
                ? amount
                : 0,
            e.key === "ArrowUp" ? -amount : e.key === "ArrowDown" ? amount : 0,
          );
      });
      return;
    }
    if (e.key === "?" || e.key === "/") {
      help();
      return;
    }
    if (e.key === "+" || e.key === "=") {
      changeZoom(1.2);
      return;
    }
    if (e.key === "-") {
      changeZoom(1 / 1.2);
      return;
    }
    const t = tools.find((t) => t[3].toLowerCase() === e.key.toLowerCase());
    if (t) setTool(t[0]);
  });
  document.addEventListener("keyup", (e) => {
    if (e.key === " ") {
      space = false;
      canvas.style.cursor = tool === "hand" ? "grab" : "default";
    }
  });
  window.addEventListener("blur", () => {
    space = false;
    if (drag) abortDrag();
  });
  window.addEventListener("beforeunload", () => {
    clearTimeout(saveTimer);
    persist();
  });
  $<HTMLInputElement>("#file-input").addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement,
      file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 8_000_000)
        throw new Error("File exceeds the 8 MB import limit.");
      const data = JSON.parse(await file.text());
      if (data.format !== "forma" || data.version !== 1)
        throw new Error("Please choose a Forma v1 document.");
      engine.load(data.nodes);
      title =
        typeof data.name === "string"
          ? data.name.slice(0, 100)
          : "Imported design";
      $<HTMLInputElement>(".file-title").value = title;
      selected.clear();
      refresh();
      fit();
      notify("Document opened");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Could not open this file.",
      );
    } finally {
      input.value = "";
    }
  });
  new ResizeObserver(() => renderCanvas()).observe($(".canvas-wrap"));
}
async function start() {
  app.innerHTML =
    '<div class="loading"><div><b style="font-size:30px">forma</b><br>Opening your canvas…</div></div>';
  await engine.init();
  let recovered = false;
  try {
    const stored = localStorage.getItem("forma.document.v1");
    if (stored) {
      const data = JSON.parse(stored);
      if (data.format !== "forma" || data.version !== 1)
        throw new Error("Unsupported saved file");
      engine.load(data.nodes);
      title = String(data.name || "Untitled design").slice(0, 100);
      engine.api.clear_history();
      recovered = true;
    }
  } catch {
    autosaveOK = false;
  }
  if (!recovered) demo(engine);
  readState();
  // Start with the artboard selected and its layers collapsed, giving the canvas room to breathe.
  if (nodes[0]) {
    selected.add(nodes[0].id);
    collapsed.add(nodes[0].id);
  }
  app.innerHTML = `<main class="app"><header class="topbar"><div class="brand"><span class="brand-mark">f</span>forma<span class="pill" style="margin-left:3px">alpha</span></div><div class="file-info"><input class="file-title" aria-label="Document name" value="${escape(title)}"><span class="saved">Saved on this device</span></div><div class="top-actions">${iconButton("undo", "undo", "Undo (Ctrl Z)")}${iconButton("redo", "redo", "Redo (Ctrl Shift Z)")}<span class="separator"></span>${iconButton("open", "folder", "Open Forma file", "optional")}${iconButton("help", "help", "Help and keyboard shortcuts", "optional")}${iconButton("preview", "play", "Preview design")}<button class="button primary" data-action="export">${icon("download", 14)} Export ${icon("down", 12)}</button><span class="avatar" title="Local workspace">YOU</span></div></header><div class="workspace"><aside class="sidebar left-sidebar"><div class="tabbar"><button class="tab active" data-tab="layers">Layers</button><button class="tab" data-tab="assets">Assets</button><span style="margin-left:auto;color:#949f88">${icon("layers", 14)}</span></div><div id="left-content" style="display:flex;flex-direction:column;flex:1;min-height:0"></div><div class="left-bottom"><span class="rust-indicator"></span>Rust engine connected ${icon("check", 12)}</div></aside><section class="canvas-wrap" aria-label="Design workspace"><div class="canvas-top"><div class="breadcrumb">Workspace ${icon("chevron", 10)} <strong>Design exploration</strong></div><div class="view-controls">${iconButton("grid", "grid", "Toggle canvas grid")}${iconButton("fit", "fit", "Zoom to fit (Shift 1)")}<span class="separator"></span>${iconButton("zoom-out", "minus", "Zoom out")}<button class="zoom-label" data-action="fit" title="Zoom to fit">100%</button>${iconButton("zoom-in", "plus", "Zoom in")}</div></div><svg id="canvas" xmlns="http://www.w3.org/2000/svg" tabindex="0" aria-label="Design canvas"><g id="viewport"><g id="scene"></g><g id="selection"></g></g></svg><nav class="toolbar" aria-label="Drawing tools">${tools.map(([id, i, name, key], index) => `${index === 1 || index === 7 ? '<span class="tool-divider"></span>' : ""}<button class="tool ${id === "select" ? "active" : ""}" data-tool="${id}" title="${name} (${key})" aria-label="${name} (${key})" aria-pressed="${id === "select"}">${icon(i, 18)}</button>`).join("")}</nav><div class="canvas-hint">SPACE to pan <span style="margin:0 8px">·</span> CTRL + SCROLL to zoom <span style="margin:0 8px">·</span> Made for your next idea</div></section><aside class="sidebar right-sidebar"><div class="tabbar"><span class="tab active" style="display:flex;align-items:center">Design</span><span style="margin-left:auto;color:#929c87;font-size:9px">PROPERTIES</span></div><div id="inspector" class="inspector"></div></aside></div><footer class="statusbar"><span id="tool-status">Move</span><span>／</span><span id="selection-status">Nothing selected</span><div class="right"><button data-action="snap" id="snap-status" title="Toggle snap to 8 px grid">Snap off</button><span id="layer-count"></span><span>${icon("lock", 10)} Local only</span><span>v0.1.0</span></div></footer></main><input id="file-input" type="file" accept=".forma,.json" hidden><div class="notice">Use a wider screen for the inspector</div>`;
  bind();
  refresh(false);
  requestAnimationFrame(() => fit());
  if (!autosaveOK)
    notify(
      "Saved data could not be restored. The sample is open; save a file before closing.",
    );
}
start().catch((error) => {
  app.innerHTML = `<div class="loading"><div><h1>Let’s get Forma running.</h1><p>${escape(String(error.message || error))}</p><p>From the project folder, run <code>npm run build:engine</code> and <code>npm run dev</code>.</p></div></div>`;
});
