import { Engine, rgb } from "./engine";
export function demo(e: Engine) {
  e.api.reset();
  const frame = e.add(3, 0, 0, 960, 680, {
    name: "Sundays / Desktop",
    fill: rgb("#faf9f5"),
  });
  const add = (
    kind: number,
    x: number,
    y: number,
    w: number,
    h: number,
    patch: Record<string, unknown>,
  ) => {
    const id = e.add(kind, x, y, w, h, patch);
    e.api.reparent(id, frame);
    return id;
  };
  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    radius = 0,
    name = "Surface",
  ) => add(0, x, y, w, h, { fill: rgb(fill), radius, name });
  const ellipse = (
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    name = "Circle",
  ) => add(1, x, y, w, h, { fill: rgb(fill), name });
  const text = (
    x: number,
    y: number,
    w: number,
    h: number,
    t: string,
    size = 16,
    fill = "#2f3b2d",
    weight = 400,
  ) =>
    add(2, x, y, w, h, {
      text: t,
      name: t.split("\n")[0],
      fontSize: size,
      fill: rgb(fill),
      fontWeight: weight,
    });
  ellipse(40, 32, 25, 25, "#42583e", "Brand mark");
  ellipse(48, 26, 9, 9, "#a6bb77", "Leaf");
  text(77, 31, 180, 35, "sundays", 27, "#2f3b2d", 700);
  text(438, 39, 95, 24, "Our approach", 12);
  text(560, 39, 75, 24, "The journal", 12);
  text(670, 39, 70, 24, "About us", 12);
  rect(804, 27, 116, 38, "#e9eddf", 19, "Navigation button");
  text(827, 39, 95, 22, "Find your calm", 11, "#2f3b2d", 600);
  rect(40, 86, 880, 1, "#dde1d5", 0, "Divider");
  rect(40, 130, 157, 29, "#e9eddf", 14, "Eyebrow pill");
  ellipse(52, 141, 6, 6, "#788f5a");
  text(66, 139, 130, 18, "A LITTLE SPACE FOR YOU", 9, "#526a48", 600);
  text(40, 184, 510, 170, "Less rush.\nMore living.", 73, "#31462e", 600);
  text(
    44,
    375,
    375,
    75,
    "Small rituals for a slower, brighter everyday.\nFind your balance, one good moment at a time.",
    15,
    "#6a7564",
  );
  rect(42, 453, 156, 49, "#344d31", 25, "Primary button");
  text(69, 470, 124, 25, "Make room for you  ↗", 12, "#ffffff", 600);
  text(219, 470, 185, 26, "Explore the journal  →", 12, "#526149", 500);
  rect(538, 122, 382, 403, "#e3e9ce", 185, "Illustration backdrop");
  ellipse(636, 164, 182, 182, "#f0ba78", "Sun");
  rect(568, 402, 321, 79, "#ced8b2", 38, "Ground");
  const p = rect(671, 267, 105, 169, "#6d8755", 50, "Stem");
  e.set(p, { rotation: 12 });
  const leaf1 = ellipse(591, 255, 141, 74, "#8fa76c", "Left leaf");
  e.set(leaf1, { rotation: 34 });
  const leaf2 = ellipse(728, 269, 128, 68, "#425e3f", "Right leaf");
  e.set(leaf2, { rotation: -36 });
  rect(665, 383, 130, 73, "#f9f6ea", 15, "Planter");
  ellipse(681, 430, 98, 12, "#dddccb", "Planter base");
  rect(553, 462, 181, 48, "#ffffff", 24, "Ritual badge");
  ellipse(568, 478, 17, 17, "#e2e9cd");
  text(595, 480, 125, 24, "Grow at your own pace", 10, "#53614b", 500);
  ellipse(847, 156, 36, 36, "#faf9f5", "Decoration");
  text(855, 164, 24, 24, "✳", 22, "#728655");
  rect(40, 566, 880, 1, "#dde1d5", 0, "Footer divider");
  text(42, 599, 160, 30, "GOOD DAYS START SMALL", 9, "#7c8774", 600);
  text(300, 587, 170, 30, "01   Breathe a little deeper", 13, "#3e5036", 500);
  text(329, 613, 180, 25, "Five minutes. All yours.", 11, "#7c8774");
  text(535, 587, 170, 30, "02   Find your daily ritual", 13, "#3e5036", 500);
  text(565, 613, 180, 25, "Make the ordinary feel good.", 11, "#7c8774");
  text(760, 587, 160, 30, "03   Keep it simple", 13, "#3e5036", 500);
  text(789, 613, 130, 25, "A little goes a long way.", 11, "#7c8774");
  e.api.clear_history();
}
