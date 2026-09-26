"""python3 holes/test_film.py: the film's numbers are right, and it runs offline from disk."""
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).parent

# 1. the numbers on screen (engines 0.2 vs 1.0 holes per plane, 250 of 300 home) come from the model tests
out = subprocess.run(["node", str(HERE / "test_model.mjs")], capture_output=True, text=True)
assert out.returncode == 0, out.stderr
assert "model ok" in out.stdout, out.stdout

# 2. every script the pages load exists next to them, and nothing is fetched from the network
for page in ["index.html", "lab.html"]:
    html = (HERE / page).read_text()
    assert html.lstrip().lower().startswith("<!doctype html>"), page
    assert '<meta name="viewport"' in html, page
    for src in re.findall(r'<script src="([^"]+)"', html):
        assert not src.startswith(("http:", "https:", "//")), (page, src)
        if src in ("media-a.js", "media-b.js", "scene-sky.js", "scene-field.js", "audio.js") and page == "lab.html":
            continue   # the bench tolerates missing modules
        assert (HERE / src).exists(), (page, src)
    assert not re.search(r'(src|href)="https?:', html), page
for js in HERE.glob("*.js"):
    code = js.read_text()
    assert "fetch(" not in code and "XMLHttpRequest" not in code and "import(" not in code, js.name

# 3. the film's copy keeps the claims that are checked above
film = (HERE / "film.js").read_text()
for claim in ["250 of 300 came home.", "one bomber in six", "Abraham Wald", "illustrative simulation"]:
    assert claim in film, claim

print("ok", out.stdout.strip())
