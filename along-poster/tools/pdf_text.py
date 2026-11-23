"""Dump the text of PDF/DOCX files so poster copy can be checked against the project's own documents.
python pdf_text.py <file> [<file> ...]   ->  work/text/<name>.txt"""
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "work" / "text"
OUT.mkdir(parents=True, exist_ok=True)


def pdf_text(path):
    import fitz
    with fitz.open(path) as doc:
        return "\n".join(f"--- page {i + 1}\n" + page.get_text() for i, page in enumerate(doc))


def docx_text(path):
    import docx
    d = docx.Document(path)
    parts = [p.text for p in d.paragraphs]
    for t in d.tables:
        for row in t.rows:
            parts.append(" | ".join(c.text.strip() for c in row.cells))
    return "\n".join(parts)


for arg in sys.argv[1:]:
    p = Path(arg)
    text = pdf_text(p) if p.suffix.lower() == ".pdf" else docx_text(p)
    dst = OUT / (p.stem + ".txt")
    dst.write_text(text, encoding="utf-8")
    print(f"{dst}  {len(text)} chars")
