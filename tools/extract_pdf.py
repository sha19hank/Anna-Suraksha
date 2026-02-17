from __future__ import annotations

import sys
from pathlib import Path

from pypdf import PdfReader


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: extract_pdf.py <path-to-pdf> [max_chars]", file=sys.stderr)
        return 2

    pdf_path = Path(sys.argv[1])
    max_chars = int(sys.argv[2]) if len(sys.argv) >= 3 else 50000

    reader = PdfReader(str(pdf_path))
    print(f"pages: {len(reader.pages)}")

    out_parts: list[str] = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        out_parts.append(f"\n--- PAGE {i+1} ---\n{text}")

    full = "\n".join(out_parts)
    print(full[:max_chars])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
