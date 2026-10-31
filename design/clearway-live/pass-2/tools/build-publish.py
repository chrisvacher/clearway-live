"""Make artifact-publish copies of the standalone pages (the artifact host adds its own document skeleton)."""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
for name in ["motion-review.html", "screens.html", "index.html"]:
    src = root / name
    if not src.exists(): continue
    s = src.read_text()
    for pat in [r'<!doctype html>\s*', r'<html[^>]*>\s*', r'<head>\s*', r'<meta charset="utf-8">\s*', r'<meta name="viewport"[^>]*>\s*', r'</head>\s*', r'<body>\s*', r'</body>\s*', r'</html>\s*']:
        s = re.sub(pat, '', s, count=1, flags=re.I)
    (out / name).write_text(s)
    print("built", out / name)
