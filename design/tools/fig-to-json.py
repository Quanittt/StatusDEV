"""Декодує canvas.fig (Kiwi) у JSON. Використання: python -I fig-to-json.py <canvas.fig> <out.json>
Сам .fig — це zip: розпакуйте його (tar -xf файл.fig -C тека) і візьміть canvas.fig.
Лише читає дані, нічого не виконує."""
import json
import struct
import sys
import zlib

src, out = sys.argv[1], sys.argv[2]
raw = open(src, "rb").read()
assert raw[:8] == b"fig-kiwi", raw[:8]
version = struct.unpack_from("<I", raw, 8)[0]
pos, chunks = 12, []
while pos < len(raw):
    n = struct.unpack_from("<I", raw, pos)[0]
    chunks.append(raw[pos + 4 : pos + 4 + n])
    pos += 4 + n


def inflate(b):
    try:
        return zlib.decompress(b, -15)
    except Exception:
        from compression import zstd  # Python 3.14+
        return zstd.decompress(b)


schema_b, data_b = inflate(chunks[0]), inflate(chunks[1])


class R:
    def __init__(s, b):
        s.b, s.p = b, 0

    def byte(s):
        v = s.b[s.p]; s.p += 1; return v

    def uint(s):
        v = shift = 0
        while True:
            c = s.byte(); v |= (c & 127) << shift; shift += 7
            if c < 128: return v

    def int(s):
        v = s.uint()
        return ~(v >> 1) if v & 1 else v >> 1

    def float(s):
        f = s.byte()
        if f == 0: return 0.0
        bits = f | s.byte() << 8 | s.byte() << 16 | s.byte() << 24
        bits = ((bits << 23) | (bits >> 9)) & 0xFFFFFFFF
        return struct.unpack("<f", struct.pack("<I", bits))[0]

    def str(s):
        e = s.b.index(0, s.p); v = s.b[s.p:e].decode("utf8", "replace"); s.p = e + 1; return v


r = R(schema_b)
defs = []
for _ in range(r.uint()):
    name, kind = r.str(), r.byte()
    fields = []
    for _ in range(r.uint()):
        fn, ft, arr, fid = r.str(), r.int(), r.byte(), r.uint()
        fields.append((fn, ft, arr, fid))
    defs.append((name, kind, fields))

PRIM = {-1: "bool", -2: "byte", -3: "int", -4: "uint", -5: "float", -6: "string", -7: "int64", -8: "uint64"}


def read_t(rd, t):
    if t < 0:
        k = PRIM[t]
        return {"bool": lambda: bool(rd.byte()), "byte": rd.byte, "int": rd.int, "uint": rd.uint,
                "float": rd.float, "string": rd.str, "int64": rd.int, "uint64": rd.uint}[k]()
    name, kind, fields = defs[t]
    if kind == 0:
        v = rd.uint()
        for fn, _, _, fid in fields:
            if fid == v: return fn
        return v
    if kind == 1:
        return {fn: read_f(rd, ft, arr) for fn, ft, arr, _ in fields}
    o = {}
    while True:
        fid = rd.uint()
        if fid == 0: return o
        fn, ft, arr, _ = next(f for f in fields if f[3] == fid)
        o[fn] = read_f(rd, ft, arr)


def read_f(rd, ft, arr):
    if arr:
        n = rd.uint()
        if ft == -2:
            v = rd.b[rd.p:rd.p + n]; rd.p += n; return f"<{n} bytes>"
        return [read_t(rd, ft) for _ in range(n)]
    return read_t(rd, ft)


root = next(i for i, d in enumerate(defs) if d[0] == "Message")
msg = read_t(R(data_b), root)
json.dump(msg, open(out, "w", encoding="utf8"), ensure_ascii=False)
print("version", version, "defs", len(defs), "keys", list(msg.keys()), "nodes", len(msg.get("nodeChanges", [])))
