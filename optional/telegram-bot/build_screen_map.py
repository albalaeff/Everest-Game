"""The screens' tree as one page, docs/screen-map.html (#344).

    uv run python scripts/build_screen_map.py

Top-down, from fxbot/i18n/screen_ids.py, under one head node, the bot: each node is a
screen, its ID, what it is and a sample of its text in English (variables shown as
‹name›). In a browser, drag a node to move it with what's under it, and click ▾ to fold
what's under it. One file, nothing to install. A test fails when the page no longer
matches the screens or their texts: run this again after changing either.
"""

import json
import sys
from pathlib import Path
from typing import Any

from fluent.runtime import FluentBundle, FluentResource
from fluent.syntax import FluentParser, ast
from fluent.syntax.visitor import Visitor

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))  # run as a script, it still finds fxbot

from fxbot.domain.language import BASE, LOCALES_DIR  # noqa: E402
from fxbot.i18n.screen_ids import SCREEN_TREE, Screen, ScreenTree  # noqa: E402

MAP = ROOT / "docs" / "screen-map.html"

# The head of the map, and the roots' groups under it: the three trees, by the area of the
# screens that start them.
BOT = "‹bot name›"
GROUPS = {"ST": "/start", "NT": "Notifications", "AN": "Anytime"}


class _Variables(Visitor):
    """Every variable's name in the translations."""

    def __init__(self) -> None:
        self.names: set[str] = set()

    def visit_VariableReference(self, node: ast.VariableReference) -> None:  # noqa: N802
        self.names.add(node.id.name)


def _english() -> tuple[FluentBundle, dict[str, str]]:
    """The English translations, and each variable as its name: ‹name›."""
    bundle = FluentBundle([BASE], use_isolating=False)
    variables = _Variables()
    for path in sorted((LOCALES_DIR / BASE).glob("*.ftl")):
        text = path.read_text(encoding="utf-8")
        bundle.add_resource(FluentResource(text))
        variables.visit(FluentParser().parse(text))
    return bundle, {name: f"‹{name}›" for name in variables.names}


_ENGLISH, _NAMED = _english()


def sample(screen: Screen) -> str:
    """The screen's text in English, as Telegram's HTML; "" when there's none to show."""
    key = screen.keys[0] if screen.keys else screen.sample
    if key is None:
        return ""
    message = _ENGLISH.get_message(key)
    assert message.value is not None, key
    text, _ = _ENGLISH.format_pattern(message.value, _NAMED)
    return str(text)


def nodes(tree: ScreenTree) -> list[dict[str, Any]]:
    """The page's data: the bot, its groups, then every screen, each naming its parent."""
    found: list[dict[str, Any]] = [
        {"id": BOT, "parent": None, "note": "", "text": "", "group": True},
        *(
            {"id": group, "parent": BOT, "note": "", "text": "", "group": True}
            for group in dict.fromkeys(GROUPS.values())
        ),
    ]

    def visit(screen: Screen, parent: str) -> None:
        found.append(
            {
                "id": screen.id,
                "parent": parent,
                "note": screen.note,
                "text": sample(screen),
                "group": False,
            }
        )
        for child in tree.children(screen.id):
            visit(child, screen.id)

    for root in tree.roots():
        visit(root, GROUPS[root.id.split("-")[0]])
    return found


def page(tree: ScreenTree = SCREEN_TREE) -> str:
    data = json.dumps(nodes(tree), ensure_ascii=False, indent=0)
    return TEMPLATE.replace("/*NODES*/", data.replace("</", "<\\/"))


TEMPLATE = """<!DOCTYPE html>
<!-- Built by scripts/build_screen_map.py from fxbot/i18n/screen_ids.py: don't edit by hand. -->
<html lang="en">
<head>
<meta charset="utf-8">
<title>fxbot screens</title>
<style>
  body { margin: 0; font: 13px/1.4 system-ui, sans-serif; background: #f4f5f7; color: #1d2330; }
  header { position: sticky; top: 0; z-index: 2; padding: 8px 16px; background: #fff;
           border-bottom: 1px solid #d8dbe2; display: flex; gap: 12px; align-items: center; }
  header h1 { font-size: 15px; margin: 0 12px 0 0; }
  button { font: inherit; padding: 3px 10px; border: 1px solid #c4c8d2; border-radius: 6px;
           background: #fff; cursor: pointer; }
  #canvas { position: relative; }
  svg { position: absolute; left: 0; top: 0; pointer-events: none; }
  .node { position: absolute; width: 220px; background: #fff; border: 1px solid #c9ced8;
          border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,.06); cursor: grab;
          user-select: none; }
  .node.dragging { cursor: grabbing; box-shadow: 0 4px 14px rgba(0,0,0,.18); z-index: 1; }
  .node.group { width: auto; min-width: 120px; background: #1d2330; color: #fff;
                border-color: #1d2330; }
  .head { display: flex; align-items: center; gap: 6px; padding: 6px 8px; }
  .id { font: 600 12px ui-monospace, monospace; }
  .note { color: #5b6476; font-size: 12px; flex: 1; }
  .group .note { color: #c9ced8; }
  .fold { border: 0; padding: 0 4px; background: none; color: inherit; font-size: 12px; }
  .text { padding: 6px 8px 8px; border-top: 1px solid #eceef2; white-space: pre-wrap;
          overflow-wrap: anywhere; max-height: 160px; overflow: hidden; }
  .text code { background: #eef0f4; padding: 0 3px; border-radius: 3px; }
  .text a { color: #2a62c9; }
</style>
</head>
<body>
<header>
  <h1>fxbot screens</h1>
  <button id="expand">Expand all</button>
  <button id="collapse">Collapse all</button>
  <button id="reset">Lay out again</button>
  <span class="note">Drag a node to move it with what's under it; ▾ folds what's under it.</span>
</header>
<div id="canvas"><svg id="edges"></svg></div>
<script>
const NODES = /*NODES*/;
const GAP_X = 24, GAP_Y = 48, TOP = 24, LEFT = 24;
const byId = new Map(NODES.map(n => [n.id, { ...n, children: [], folded: false }]));
for (const n of byId.values()) if (n.parent) byId.get(n.parent).children.push(n);
const roots = [...byId.values()].filter(n => !n.parent);
const canvas = document.getElementById("canvas"), edges = document.getElementById("edges");

for (const n of byId.values()) {
  const el = document.createElement("div");
  el.className = "node" + (n.group ? " group" : "");
  el.innerHTML = `<div class="head"><span class="id"></span><span class="note"></span></div>`;
  el.querySelector(".id").textContent = n.id;
  el.querySelector(".note").textContent = n.note;
  if (n.children.length) {
    const fold = document.createElement("button");
    fold.className = "fold";
    fold.onclick = e => { e.stopPropagation(); n.folded = !n.folded; draw(); };
    el.querySelector(".head").append(fold);
    n.foldButton = fold;
  }
  if (n.text) {
    const text = document.createElement("div");
    text.className = "text";
    text.innerHTML = n.text;  // the bot's own HTML, from its translations
    el.append(text);
  }
  canvas.append(el);
  n.el = el;
  drag(n);
}

function shown(n) { return n.folded ? [] : n.children; }

function layout() {
  // Leaves side by side, each parent over its children, each child just under its parent.
  let next = LEFT;
  const place = (n, y) => {
    n.y = y;
    const kids = shown(n);
    if (!kids.length) { n.x = next; next += n.el.offsetWidth + GAP_X; return; }
    kids.forEach(c => place(c, y + n.el.offsetHeight + GAP_Y));
    const first = kids[0], last = kids[kids.length - 1];
    n.x = Math.max(first.x, (first.x + last.x + last.el.offsetWidth - n.el.offsetWidth) / 2);
  };
  roots.forEach(r => { place(r, TOP); next += GAP_X * 2; });
}

function visible() {
  const out = [];
  const walk = n => { out.push(n); shown(n).forEach(walk); };
  roots.forEach(walk);
  return out;
}

function draw() {
  const seen = new Set(visible());
  for (const n of byId.values()) {
    n.el.style.display = seen.has(n) ? "" : "none";
    if (n.foldButton) n.foldButton.textContent = (n.folded ? "▸ " : "▾ ") + n.children.length;
  }
  if ([...seen].some(n => n.x === undefined)) layout();
  let width = 0, height = 0, lines = "";
  for (const n of seen) {
    n.el.style.left = n.x + "px";
    n.el.style.top = n.y + "px";
    width = Math.max(width, n.x + n.el.offsetWidth);
    height = Math.max(height, n.y + n.el.offsetHeight);
    for (const c of shown(n)) {
      const x1 = n.x + n.el.offsetWidth / 2, y1 = n.y + n.el.offsetHeight;
      const x2 = c.x + c.el.offsetWidth / 2, y2 = c.y, mid = (y1 + y2) / 2;
      lines += `<path d="M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}"/>`;
    }
  }
  canvas.style.width = width + LEFT + "px";
  canvas.style.height = height + TOP + "px";
  edges.setAttribute("width", width + LEFT);
  edges.setAttribute("height", height + TOP);
  edges.innerHTML = `<g fill="none" stroke="#9aa2b1" stroke-width="1.2">${lines}</g>`;
}

function drag(n) {
  n.el.addEventListener("pointerdown", e => {
    if (e.target.closest("button")) return;
    const moved = [];
    const walk = m => { moved.push([m, m.x, m.y]); shown(m).forEach(walk); };
    walk(n);
    const startX = e.clientX, startY = e.clientY;
    n.el.classList.add("dragging");
    n.el.setPointerCapture(e.pointerId);
    const move = ev => {
      for (const [m, x, y] of moved) {
        m.x = x + ev.clientX - startX;
        m.y = Math.max(0, y + ev.clientY - startY);
      }
      draw();
    };
    const up = () => {
      n.el.classList.remove("dragging");
      n.el.removeEventListener("pointermove", move);
      n.el.removeEventListener("pointerup", up);
    };
    n.el.addEventListener("pointermove", move);
    n.el.addEventListener("pointerup", up);
  });
}

function relayout() { for (const n of byId.values()) n.x = undefined; draw(); }
function foldAll(folded) {
  for (const n of byId.values()) if (!n.group) n.folded = folded;
  relayout();
}
document.getElementById("expand").onclick = () => foldAll(false);
document.getElementById("collapse").onclick = () => foldAll(true);
document.getElementById("reset").onclick = relayout;
// To begin: /start two levels deep, the notifications and the anytime screens folded
// (they're wide), and the bot in view.
for (const n of byId.values()) {
  let depth = 0;
  for (let p = n.parent; p; p = byId.get(p).parent) depth++;
  n.folded = depth >= 3 || (depth === 1 && n.id !== "/start");
}
draw();
const head = roots[0];
window.scrollTo(head.x + head.el.offsetWidth / 2 - innerWidth / 2, 0);
</script>
</body>
</html>
"""


def main() -> None:
    MAP.write_text(page(), encoding="utf-8", newline="\n")
    print(f"Wrote {MAP.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
