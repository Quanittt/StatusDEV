import json
import sys
from collections import Counter

d = json.load(open(sys.argv[1], encoding="utf8"))
nodes = d["nodeChanges"]
by = {}
for n in nodes:
    g = n.get("guid") or {}
    by[(g.get("sessionID"), g.get("localID"))] = n


def key(g):
    return (g.get("sessionID"), g.get("localID")) if g else None


kids = {}
for n in nodes:
    p = (n.get("parentIndex") or {}).get("guid")
    kids.setdefault(key(p), []).append(n)
for v in kids.values():
    v.sort(key=lambda n: (n.get("parentIndex") or {}).get("position", ""))

print("TYPES", dict(Counter(n.get("type") for n in nodes)))


def hexc(c):
    return "#%02X%02X%02X" % tuple(round(c[k] * 255) for k in "rgb")


def fill(n):
    for f in n.get("fillPaints") or []:
        if f.get("type") == "SOLID" and f.get("visible", True):
            return hexc(f["color"])
    return None


def walk(n, depth, maxd):
    t = n.get("type")
    sz = n.get("size") or {}
    line = "  " * depth + f"{t} '{n.get('name')}' {round(sz.get('x', 0))}x{round(sz.get('y', 0))}"
    if fill(n): line += f" fill={fill(n)}"
    if t == "TEXT":
        line += f" «{(n.get('textData') or {}).get('characters', '')[:60]}» {n.get('fontSize')}px {(n.get('fontName') or {}).get('family')} {(n.get('fontName') or {}).get('style')}"
    if n.get("stackMode"): line += f" auto-layout={n['stackMode']} gap={n.get('stackSpacing')}"
    if n.get("cornerRadius"): line += f" r={n['cornerRadius']}"
    print(line)
    if depth < maxd:
        for c in kids.get(key(n.get("guid")), []):
            walk(c, depth + 1, maxd)


root = next(n for n in nodes if n.get("type") == "DOCUMENT")
for page in kids.get(key(root["guid"]), []):
    print("\n=== PAGE", page.get("name"), "children:", len(kids.get(key(page["guid"]), [])))
    for top in kids.get(key(page["guid"]), []):
        walk(top, 1, 1)

# палітра і шрифти
colors, fonts, sizes = Counter(), Counter(), Counter()
for n in nodes:
    c = fill(n)
    if c: colors[c] += 1
    if n.get("type") == "TEXT":
        fn = n.get("fontName") or {}
        fonts[(fn.get("family"), fn.get("style"))] += 1
        sizes[n.get("fontSize")] += 1
print("\nCOLORS", colors.most_common(25))
print("FONTS", fonts.most_common(10))
print("SIZES", sorted(sizes.items(), key=lambda x: -x[1])[:15])
print("RADII", Counter(n.get("cornerRadius") for n in nodes if n.get("cornerRadius")).most_common(8))
comps = [n for n in nodes if n.get("type") in ("SYMBOL", "COMPONENT", "COMPONENT_SET")]
print("COMPONENTS", len(comps), [c.get("name") for c in comps][:40])
vs = [n for n in nodes if n.get("type") == "VARIABLE"]
print("VARIABLES", len(vs), [v.get("name") for v in vs][:40])
