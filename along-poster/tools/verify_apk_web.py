"""Check that the extracted web assets used for capture are byte-identical to the newest APK's assets/.
python verify_apk_web.py <apk> <extracted-dir>"""
import hashlib
import sys
import zipfile
from pathlib import Path

apk, root = Path(sys.argv[1]), Path(sys.argv[2])
same = diff = missing = 0
with zipfile.ZipFile(apk) as z:
    for info in z.infolist():
        if not info.filename.startswith("assets/") or info.is_dir():
            continue
        rel = info.filename[len("assets/"):]
        local = root / rel
        if not local.exists():
            missing += 1
            if missing <= 5:
                print("missing", rel)
            continue
        if hashlib.sha256(z.read(info)).digest() == hashlib.sha256(local.read_bytes()).digest():
            same += 1
        else:
            diff += 1
            if diff <= 10:
                print("DIFF", rel)
print(f"assets identical: {same}  different: {diff}  missing locally: {missing}")
