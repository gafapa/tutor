import json
import re
import sys
from pathlib import Path
from pypdf import PdfReader

verification = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
results = {}
for kind, path in verification["pdfOutputs"].items():
    reader = PdfReader(path, strict=True)
    texts = []
    for index, page in enumerate(reader.pages):
        assert abs(float(page.mediabox.width) - 595.28) < 2
        assert abs(float(page.mediabox.height) - 841.89) < 2
        text = page.extract_text() or ""
        assert len(text.strip()) > 100, f"Página vacía o casi vacía: {kind} {index + 1}"
        assert f"{index + 1} / {len(reader.pages)}" in text, f"Falta la numeración: {kind} {index + 1}"
        texts.append(text)
    combined = "\n".join(texts)
    assert "Potencias de 2" in combined
    assert "Consolidado" in combined
    assert "undefined" not in combined
    assert "NO_EXPORTAR_OTRA_MATERIA" not in combined
    assert len(re.findall(r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}", combined)) >= 4
    assert "RA1" in combined if kind == "unit" else True
    if kind == "transition":
        assert "Segundo curso" in combined
        assert "Subnetting" not in combined
        assert "<script>neverRun()</script>" in combined
    results[kind] = {"pages": len(reader.pages), "allPagesHaveText": True, "a4": True, "pageNumbers": True, "scopedEvidence": True, "tagged": bool(reader.trailer["/Root"].get("/MarkInfo", {}).get("/Marked"))}
prefix = "packaged-" if verification["packaged"] else ""
Path(f"test-results/{prefix}reports-pdf-text-verification.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(results, ensure_ascii=False))
