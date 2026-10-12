import { Shape, color } from "./engine";
export const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function box(nodes: Shape[]) {
  if (!nodes.length) return { x: 0, y: 0, w: 960, h: 680 };
  const points = nodes.flatMap((n) => {
    const r = (n.rotation * Math.PI) / 180,
      cx = n.x + n.w / 2,
      cy = n.y + n.h / 2;
    return [
      [-n.w / 2, -n.h / 2],
      [n.w / 2, -n.h / 2],
      [n.w / 2, n.h / 2],
      [-n.w / 2, n.h / 2],
    ].map(([x, y]) => ({
      x: cx + x * Math.cos(r) - y * Math.sin(r),
      y: cy + x * Math.sin(r) + y * Math.cos(r),
    }));
  });
  const x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y));
  return {
    x,
    y,
    w: Math.max(...points.map((p) => p.x)) - x,
    h: Math.max(...points.map((p) => p.y)) - y,
  };
}
export function artwork(nodes: Shape[], parent = 0): string {
  return nodes
    .filter((n) => n.parent === parent && n.visible)
    .map((n) => {
      const fill = color(n.fill),
        stroke = color(n.stroke),
        transform = `rotate(${n.rotation} ${n.x + n.w / 2} ${n.y + n.h / 2})`;
      const style = `fill="${fill}" stroke="${stroke}" stroke-width="${n.strokeWidth}"`;
      let body = "";
      if (n.kind === 0 || n.kind === 3)
        body = `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${n.radius}" ${style}/>`;
      if (n.kind === 1)
        body = `<ellipse cx="${n.x + n.w / 2}" cy="${n.y + n.h / 2}" rx="${n.w / 2}" ry="${n.h / 2}" ${style}/>`;
      if (n.kind === 2)
        body = `<text x="${n.x}" y="${n.y + n.fontSize * 0.84}" ${style} font-family="Arial, sans-serif" font-size="${n.fontSize}" font-weight="${n.fontWeight}" xml:space="preserve">${n.text
          .split("\n")
          .map(
            (t, i) =>
              `<tspan x="${n.x}" dy="${i ? n.fontSize * 1.3 : 0}" style="unicode-bidi:plaintext">${escape(t)}</tspan>`,
          )
          .join("")}</text>`;
      if (n.kind === 4)
        body = `<line x1="${n.x}" y1="${n.y}" x2="${n.x + n.w}" y2="${n.y + n.h}" stroke="${stroke}" stroke-width="${Math.max(1, n.strokeWidth)}" stroke-linecap="round"/>`;
      if (n.kind === 5)
        body = `<svg x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" viewBox="0 0 1000 1000" preserveAspectRatio="none" overflow="visible"><path d="${escape(n.text)}" fill="none" stroke="${stroke}" stroke-width="${Math.max(1, n.strokeWidth)}" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      return `<g data-layer="${n.id}" opacity="${n.opacity}"><g transform="${transform}">${body}</g>${n.kind === 3 ? artwork(nodes, n.id) : ""}</g>`;
    })
    .join("");
}
export function exportSVG(nodes: Shape[]) {
  const b = box(nodes.filter((n) => n.visible));
  const pad = Math.max(2, ...nodes.map((n) => n.strokeWidth / 2));
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(b.w + pad * 2)}" height="${Math.ceil(b.h + pad * 2)}" viewBox="${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}">${artwork(nodes)}</svg>`,
    w: Math.ceil(b.w + pad * 2),
    h: Math.ceil(b.h + pad * 2),
  };
}
