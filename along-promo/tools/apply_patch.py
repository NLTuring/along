"""Apply exact string replacements from a JSON patch: {"file": "...", "edits": [[old, new], ...]}.
python tools/apply_patch.py patch.json   (fails loudly if any `old` is missing or ambiguous)"""
import json, sys
from pathlib import Path

patch = json.loads(Path(sys.argv[1]).read_text(encoding="utf8"))
path = Path(patch["file"])
s = path.read_text(encoding="utf8")
for old, new in patch["edits"]:
    n = s.count(old)
    if n != 1:
        sys.exit(f"edit not applied ({n} matches): {old[:80]!r}")
    s = s.replace(old, new)
path.write_text(s, encoding="utf8")
print(f"{len(patch['edits'])} edits applied to {path.name}")
