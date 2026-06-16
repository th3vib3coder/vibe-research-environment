#!/usr/bin/env python3
"""Synthetic-only HGSOC CD8/CXCL13 smoke artifact for T11.0.2.

This script intentionally does not import scanpy, numba, pynndescent, UMAP,
or AnnData. The real h5ad lane is deferred until the pinned VRE science
environment is authorized. T11.0.2 exercises only the core subset arithmetic
on deterministic in-repo synthetic cells.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from typing import Any


def stable_hash(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def synthetic_cells() -> list[dict[str, Any]]:
    return [
        {
            "cellId": "synthetic-cell-001",
            "patientId": "P1",
            "batchId": "B1",
            "cell_type_reviewed": "CD8 T cell",
            "genes": {"CD8A": 4, "CD8B": 2, "CXCL13": 3},
        },
        {
            "cellId": "synthetic-cell-002",
            "patientId": "P1",
            "batchId": "B1",
            "cell_type_reviewed": "CD8 T cell",
            "genes": {"CD8A": 5, "CD8B": 3, "CXCL13": 0},
        },
        {
            "cellId": "synthetic-cell-003",
            "patientId": "P2",
            "batchId": "B2",
            "cell_type_reviewed": "CD8 T cell",
            "genes": {"CD8A": 3, "CD8B": 4, "CXCL13": 5},
        },
        {
            "cellId": "synthetic-cell-004",
            "patientId": "P2",
            "batchId": "B2",
            "cell_type_reviewed": "CD8 T cell",
            "genes": {"CD8A": 6, "CD8B": 2, "CXCL13": 0},
        },
        {
            "cellId": "synthetic-cell-005",
            "patientId": "P3",
            "batchId": "B1",
            "cell_type_reviewed": "B cell",
            "genes": {"MS4A1": 8, "CXCL13": 7},
        },
        {
            "cellId": "synthetic-cell-006",
            "patientId": "P3",
            "batchId": "B2",
            "cell_type_reviewed": "Tumor cell",
            "genes": {"EPCAM": 9, "CXCL13": 1},
        },
    ]


def synthetic_fixture() -> dict[str, Any]:
    return {
        "schemaVersion": "phase11.hgsoc-cd8-synthetic-fixture.v1",
        "seed": 1102,
        "source": "deterministic-in-repo-synthetic-not-real-h5ad",
        "cells": synthetic_cells(),
    }


def analyze_synthetic() -> dict[str, Any]:
    fixture = synthetic_fixture()
    cd8_cells = [
        cell
        for cell in fixture["cells"]
        if cell["cell_type_reviewed"] == "CD8 T cell"
    ]
    positive = [
        cell
        for cell in cd8_cells
        if float(cell.get("genes", {}).get("CXCL13", 0)) > 0
    ]
    fraction = 0 if not cd8_cells else round(len(positive) / len(cd8_cells), 6)
    return {
        "schemaVersion": "phase11.hgsoc-cd8-synthetic-output.v1",
        "fixtureSha256": stable_hash(fixture),
        "inputMode": "synthetic-only",
        "cellCount": len(fixture["cells"]),
        "cd8Cells": len(cd8_cells),
        "cxcl13PositiveCd8Cells": len(positive),
        "cxcl13PositiveFraction": fraction,
        "claimReady": False,
        "performsRealDataAnalysis": False,
        "promotesClaim": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--synthetic-smoke", action="store_true")
    parser.add_argument("--h5ad", default=None)
    args = parser.parse_args()

    if args.h5ad:
        print("E_PHASE11_REAL_H5AD_DEFERRED", file=sys.stderr)
        return 2
    if not args.synthetic_smoke:
        print("E_PHASE11_SYNTHETIC_SMOKE_REQUIRED", file=sys.stderr)
        return 2

    print(json.dumps(analyze_synthetic(), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
