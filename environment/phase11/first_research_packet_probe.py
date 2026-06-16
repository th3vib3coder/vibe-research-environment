#!/usr/bin/env python3
"""Local-only T11.0.3 HGSOC H5AD metadata/gene-key probe.

This helper is intentionally not used by CI. It recomputes hashes and opens
local H5AD files with AnnData backed="r" for metadata/gene-key inspection only.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import platform
from datetime import datetime, timezone
from pathlib import Path

import anndata as ad
import numpy as np


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def version(package: str) -> str:
    return importlib.metadata.version(package)


def has_cxcl13(adata: ad.AnnData) -> bool:
    if "gene_symbol" in adata.var.columns:
        return "CXCL13" in set(adata.var["gene_symbol"].astype(str))
    return "CXCL13" in set(map(str, adata.var_names))


def inspect_h5ad(root: Path, candidate: dict[str, object]) -> dict[str, object]:
    relative = str(candidate["relativePath"])
    path = root / relative
    execution_hash = sha256_file(path)
    inventory_hash = str(candidate["sha256"])
    opened = ad.read_h5ad(path, backed="r")
    try:
        return {
            "relativePath": relative.replace("\\", "/"),
            "sizeBytes": path.stat().st_size,
            "inventorySha256": inventory_hash,
            "executionSha256": execution_hash,
            "hashRecomputedAt": datetime.now(timezone.utc).isoformat(),
            "hashMatchesInventory": execution_hash == inventory_hash,
            "readStatus": "PASS_BACKED_R_METADATA_ONLY",
            "nObs": int(opened.n_obs),
            "nVars": int(opened.n_vars),
            "obsColumns": list(map(str, opened.obs.columns)),
            "varColumns": list(map(str, opened.var.columns)),
            "layers": list(map(str, opened.layers.keys())),
            "cxcl13GeneSymbolPresent": has_cxcl13(opened),
        }
    finally:
        if getattr(opened, "file", None) is not None:
            opened.file.close()


def select_hgsoc_candidates(inventory: dict[str, object]) -> list[dict[str, object]]:
    candidates = []
    for candidate in inventory.get("candidateFiles", []):
        if not isinstance(candidate, dict):
            continue
        if candidate.get("sourceAccession") != "GSE184880":
            continue
        if candidate.get("type") != "h5ad":
            continue
        if candidate.get("role") != "primary-hgsoc-h5ad-candidate":
            continue
        candidates.append(candidate)
    return sorted(candidates, key=lambda item: str(item["relativePath"]))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inventory-json", required=True)
    parser.add_argument("--root", required=True)
    parser.add_argument("--output-json", required=True)
    args = parser.parse_args()

    inventory_path = Path(args.inventory_json)
    root = Path(args.root)
    output_path = Path(args.output_json)
    inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
    selected = select_hgsoc_candidates(inventory)
    files = [inspect_h5ad(root, candidate) for candidate in selected]

    payload = {
        "schemaVersion": "phase11.t11.0.3.local-h5ad-probe.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "realDataReadBoundary": {
            "localOnly": True,
            "ciFixtureOnly": True,
            "readInCi": False,
        },
        "environment": {
            "interpreterId": "venv_scrna",
            "pythonVersion": platform.python_version(),
            "anndataVersion": version("anndata"),
            "numpyVersion": np.__version__,
        },
        "h5adReadMode": "backed-r",
        "selectedH5adFiles": files,
        "summary": {
            "fileCount": len(files),
            "totalCells": int(sum(item["nObs"] for item in files)),
            "allHashesMatchInventory": all(item["hashMatchesInventory"] for item in files),
            "allCxcl13GeneSymbolPresent": all(
                item["cxcl13GeneSymbolPresent"] for item in files
            ),
            "cellTypeAnnotationStatus": "absent-reviewed-key",
        },
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "output": str(output_path),
        "fileCount": len(files),
        "allHashesMatchInventory": payload["summary"]["allHashesMatchInventory"],
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
