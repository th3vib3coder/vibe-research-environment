# Phase 13 VRE Feature Ledger Index

## Purpose

This is the index of all VRE feature-ledger files for Phase 13.

Exactly one file has `status = active` at any time. All others are archived with
a closed date.

## Index

| file | status | seq range | opened | closed | notes |
|---|---|---|---|---|---|
| `phase13-vre-feature-ledger.md` | active | `000-...` | 2026-06-18 | - | First ledger. Bootstrap and Wave 0 safety-foundation row. |

## Rotation Rule

When the active ledger reaches 400 rows, the next pass that appends new VRE
feature rows MUST prepare the successor file. Rows are never deleted or
reordered.
