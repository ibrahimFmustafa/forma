//! Forma's independent scene graph and transaction engine. No third-party code or dependencies.
//! The small C ABI is consumed directly by WebAssembly; no generated binding runtime is needed.
use std::cell::RefCell;
use std::fmt::Write;

const LIMIT: usize = 2000;
const HISTORY: usize = 80;

#[derive(Clone, Debug, PartialEq)]
struct Node {
    id: u32,
    kind: u32,
    parent: u32,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    rotation: f64,
    fill: u32,
    stroke: u32,
    stroke_width: f64,
    radius: f64,
    opacity: f64,
    font_size: f64,
    font_weight: f64,
    visible: bool,
    locked: bool,
    name: String,
    text: String,
}
impl Node {
    fn new(id: u32, kind: u32, x: f64, y: f64, w: f64, h: f64) -> Self {
        Self {
            id,
            kind,
            parent: 0,
            x,
            y,
            w: w.max(1.0),
            h: h.max(1.0),
            rotation: 0.0,
            fill: if kind == 2 { 0x252824 } else { 0xb8d992 },
            stroke: 0x252824,
            stroke_width: if kind == 4 || kind == 5 { 2.0 } else { 0.0 },
            radius: 0.0,
            opacity: 1.0,
            font_size: 24.0,
            font_weight: 400.0,
            visible: true,
            locked: false,
            name: ["Rectangle", "Ellipse", "Text", "Frame", "Line", "Drawing"][kind as usize]
                .into(),
            text: if kind == 2 {
                "Your text".into()
            } else {
                String::new()
            },
        }
    }
    fn contains(&self, x: f64, y: f64) -> bool {
        let cx = self.x + self.w / 2.0;
        let cy = self.y + self.h / 2.0;
        let angle = -self.rotation.to_radians();
        let px = (x - cx) * angle.cos() - (y - cy) * angle.sin();
        let py = (x - cx) * angle.sin() + (y - cy) * angle.cos();
        if self.kind == 1 {
            (px / (self.w / 2.0)).powi(2) + (py / (self.h / 2.0)).powi(2) <= 1.0
        } else {
            px.abs() <= self.w / 2.0 + if self.kind == 4 { 4.0 } else { 0.0 }
                && py.abs() <= self.h / 2.0 + if self.kind == 4 { 4.0 } else { 0.0 }
        }
    }
}
#[derive(Default)]
struct Engine {
    nodes: Vec<Node>,
    next: u32,
    past: Vec<Vec<Node>>,
    future: Vec<Vec<Node>>,
    pending: Option<Vec<Node>>,
}
impl Engine {
    fn begin(&mut self) {
        if self.pending.is_none() {
            self.pending = Some(self.nodes.clone());
        }
    }
    fn commit(&mut self) {
        if let Some(before) = self.pending.take() {
            if before != self.nodes {
                self.past.push(before);
                if self.past.len() > HISTORY {
                    self.past.remove(0);
                }
                self.future.clear();
            }
        }
    }
    fn is_descendant(&self, id: u32, ancestor: u32) -> bool {
        let mut current = id;
        for _ in 0..self.nodes.len() {
            if current == ancestor {
                return true;
            }
            current = self
                .nodes
                .iter()
                .find(|n| n.id == current)
                .map_or(0, |n| n.parent);
            if current == 0 {
                break;
            }
        }
        false
    }
    fn effective(&self, id: u32) -> bool {
        let mut current = id;
        for _ in 0..=self.nodes.len() {
            if current == 0 {
                return true;
            }
            let Some(n) = self.nodes.iter().find(|n| n.id == current) else {
                return false;
            };
            if !n.visible || n.locked {
                return false;
            }
            current = n.parent;
        }
        false
    }
    fn translate(&mut self, id: u32, dx: f64, dy: f64) {
        let ids: Vec<u32> = self
            .nodes
            .iter()
            .filter(|n| self.is_descendant(n.id, id))
            .map(|n| n.id)
            .collect();
        for n in &mut self.nodes {
            if ids.contains(&n.id) {
                n.x = (n.x + dx).clamp(-100000.0, 100000.0);
                n.y = (n.y + dy).clamp(-100000.0, 100000.0);
            }
        }
    }
}
thread_local! {
    static ENGINE: RefCell<Engine> = RefCell::new(Engine::default());
    static INPUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    static OUTPUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}
fn edit<T>(f: impl FnOnce(&mut Engine) -> T) -> T {
    ENGINE.with(|e| f(&mut e.borrow_mut()))
}
fn finite(values: &[f64]) -> bool {
    values.iter().all(|v| v.is_finite())
}
fn quote(s: &str) -> String {
    let mut out = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 32 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
    out
}
#[no_mangle]
pub extern "C" fn reset() {
    edit(|e| *e = Engine::default());
}
#[no_mangle]
pub extern "C" fn begin() {
    edit(|e| e.begin());
}
#[no_mangle]
pub extern "C" fn commit() {
    edit(|e| e.commit());
}
#[no_mangle]
pub extern "C" fn cancel() {
    edit(|e| {
        if let Some(n) = e.pending.take() {
            e.nodes = n;
        }
    });
}
#[no_mangle]
pub extern "C" fn clear_history() {
    edit(|e| {
        e.past.clear();
        e.future.clear();
        e.pending = None;
    });
}
#[no_mangle]
pub extern "C" fn undo() -> u32 {
    edit(|e| {
        e.commit();
        if let Some(n) = e.past.pop() {
            e.future.push(std::mem::replace(&mut e.nodes, n));
            1
        } else {
            0
        }
    })
}
#[no_mangle]
pub extern "C" fn redo() -> u32 {
    edit(|e| {
        if let Some(n) = e.future.pop() {
            e.past.push(std::mem::replace(&mut e.nodes, n));
            1
        } else {
            0
        }
    })
}
#[no_mangle]
pub extern "C" fn history_count(which: u32) -> u32 {
    edit(|e| {
        if which == 0 {
            e.past.len() as u32
        } else {
            e.future.len() as u32
        }
    })
}
#[no_mangle]
pub extern "C" fn add(kind: u32, x: f64, y: f64, w: f64, h: f64) -> u32 {
    if kind > 5 || !finite(&[x, y, w, h]) {
        return 0;
    }
    edit(|e| {
        if e.nodes.len() >= LIMIT {
            return 0;
        }
        e.next += 1;
        e.nodes.push(Node::new(
            e.next,
            kind,
            x.clamp(-100000.0, 100000.0),
            y.clamp(-100000.0, 100000.0),
            w.clamp(1.0, 20000.0),
            h.clamp(1.0, 20000.0),
        ));
        e.next
    })
}
/// Fields: x,y,w,h,rotation,fill,stroke,stroke_width,radius,opacity,font_size,font_weight,visible,locked.
#[no_mangle]
pub extern "C" fn set_num(id: u32, field: u32, value: f64) {
    if !value.is_finite() {
        return;
    }
    edit(|e| {
        if field < 2 {
            if let Some(n) = e.nodes.iter().find(|n| n.id == id) {
                let dx = if field == 0 {
                    value.clamp(-100000.0, 100000.0) - n.x
                } else {
                    0.0
                };
                let dy = if field == 1 {
                    value.clamp(-100000.0, 100000.0) - n.y
                } else {
                    0.0
                };
                e.translate(id, dx, dy);
            }
            return;
        }
        if let Some(n) = e.nodes.iter_mut().find(|n| n.id == id) {
            match field {
                2 => n.w = value.clamp(1.0, 20000.0),
                3 => n.h = value.clamp(1.0, 20000.0),
                4 => n.rotation = if n.kind == 3 { 0.0 } else { value % 360.0 },
                5 => n.fill = value.clamp(0.0, 16777215.0) as u32,
                6 => n.stroke = value.clamp(0.0, 16777215.0) as u32,
                7 => n.stroke_width = value.clamp(0.0, 200.0),
                8 => n.radius = value.clamp(0.0, 10000.0),
                9 => n.opacity = value.clamp(0.0, 1.0),
                10 => n.font_size = value.clamp(4.0, 500.0),
                11 => n.font_weight = value.clamp(100.0, 900.0),
                12 => n.visible = value != 0.0,
                13 => n.locked = value != 0.0,
                _ => (),
            }
        }
    });
}
/// Single reusable bounded input buffer, written by the host. Returned pointer is invalidated by the next input_alloc.
#[no_mangle]
pub extern "C" fn input_alloc(len: u32) -> *mut u8 {
    INPUT.with(|b| {
        let mut b = b.borrow_mut();
        b.resize((len as usize).min(65536), 0);
        b.as_mut_ptr()
    })
}
#[no_mangle]
pub extern "C" fn set_text(id: u32, slot: u32) {
    let value = INPUT.with(|b| String::from_utf8_lossy(&b.borrow()).into_owned());
    edit(|e| {
        if let Some(n) = e.nodes.iter_mut().find(|n| n.id == id) {
            if slot == 0 {
                n.name = value.chars().take(120).collect();
            } else {
                n.text = value.chars().take(16000).collect();
            }
        }
    });
}
#[no_mangle]
pub extern "C" fn translate(id: u32, dx: f64, dy: f64) {
    if finite(&[dx, dy]) {
        edit(|e| e.translate(id, dx, dy));
    }
}
#[no_mangle]
pub extern "C" fn reparent(id: u32, parent: u32) -> u32 {
    edit(|e| {
        if parent != 0
            && (!e.nodes.iter().any(|n| n.id == parent && n.kind == 3)
                || e.is_descendant(parent, id))
        {
            return 0;
        }
        if let Some(n) = e.nodes.iter_mut().find(|n| n.id == id) {
            n.parent = parent;
            return 1;
        }
        0
    })
}
#[no_mangle]
pub extern "C" fn remove(id: u32) {
    edit(|e| {
        let ids: Vec<u32> = e
            .nodes
            .iter()
            .filter(|n| e.is_descendant(n.id, id))
            .map(|n| n.id)
            .collect();
        e.nodes.retain(|n| !ids.contains(&n.id));
    });
}
#[no_mangle]
pub extern "C" fn duplicate(id: u32) -> u32 {
    edit(|e| {
        let source: Vec<Node> = e
            .nodes
            .iter()
            .filter(|n| e.is_descendant(n.id, id))
            .cloned()
            .collect();
        if source.is_empty() || source.len() + e.nodes.len() > LIMIT {
            return 0;
        }
        let map: Vec<(u32, u32)> = source
            .iter()
            .map(|n| {
                e.next += 1;
                (n.id, e.next)
            })
            .collect();
        let root = map.iter().find(|(old, _)| *old == id).unwrap().1;
        for mut n in source {
            n.id = map.iter().find(|(old, _)| *old == n.id).unwrap().1;
            if let Some((_, new)) = map.iter().find(|(old, _)| *old == n.parent) {
                n.parent = *new;
            }
            n.x += 24.0;
            n.y += 24.0;
            if n.id == root {
                n.name.push_str(" copy");
            }
            e.nodes.push(n);
        }
        root
    })
}
#[no_mangle]
pub extern "C" fn reorder(id: u32, direction: i32) {
    edit(|e| {
        if let Some(i) = e.nodes.iter().position(|n| n.id == id) {
            let parent = e.nodes[i].parent;
            let j = if direction > 0 {
                ((i + 1)..e.nodes.len()).find(|j| e.nodes[*j].parent == parent)
            } else {
                (0..i).rev().find(|j| e.nodes[*j].parent == parent)
            };
            if let Some(j) = j {
                e.nodes.swap(i, j);
            }
        }
    });
}
fn hit_level(e: &Engine, parent: u32, x: f64, y: f64) -> u32 {
    for n in e
        .nodes
        .iter()
        .rev()
        .filter(|n| n.parent == parent && e.effective(n.id))
    {
        if n.kind == 3 {
            let hit = hit_level(e, n.id, x, y);
            if hit != 0 {
                return hit;
            }
        }
        if n.contains(x, y) {
            return n.id;
        }
    }
    0
}
#[no_mangle]
pub extern "C" fn hit_test(x: f64, y: f64) -> u32 {
    edit(|e| hit_level(e, 0, x, y))
}
#[no_mangle]
pub extern "C" fn snapshot() -> *const u8 {
    let json = edit(|e| {
        let mut s = String::from("[");
        for (i, n) in e.nodes.iter().enumerate() {
            if i > 0 {
                s.push(',');
            }
            let _ = write!(s,"{{\"id\":{},\"kind\":{},\"parent\":{},\"x\":{},\"y\":{},\"w\":{},\"h\":{},\"rotation\":{},\"fill\":{},\"stroke\":{},\"strokeWidth\":{},\"radius\":{},\"opacity\":{},\"fontSize\":{},\"fontWeight\":{},\"visible\":{},\"locked\":{},\"name\":{},\"text\":{}}}",
                n.id,n.kind,n.parent,n.x,n.y,n.w,n.h,n.rotation,n.fill,n.stroke,n.stroke_width,n.radius,n.opacity,n.font_size,n.font_weight,n.visible,n.locked,quote(&n.name),quote(&n.text));
        }
        s.push(']');
        s
    });
    OUTPUT.with(|b| {
        *b.borrow_mut() = json.into_bytes();
        b.borrow().as_ptr()
    })
}
#[no_mangle]
pub extern "C" fn output_len() -> u32 {
    OUTPUT.with(|b| b.borrow().len() as u32)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rotated_hit_geometry() {
        let mut n = Node::new(1, 0, 0.0, 0.0, 100.0, 20.0);
        n.rotation = 90.0;
        assert!(n.contains(50.0, 40.0));
        assert!(!n.contains(90.0, 10.0));
    }
    #[test]
    fn empty_transactions_preserve_redo() {
        let mut e = Engine::default();
        e.begin();
        e.commit();
        assert!(e.past.is_empty());
    }
    #[test]
    fn escaped_strings_are_json_safe() {
        assert_eq!(quote("a\n\"b"), "\"a\\n\\\"b\"");
    }
}
