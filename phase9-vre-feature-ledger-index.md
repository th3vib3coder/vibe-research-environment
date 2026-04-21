# Phase 9 VRE Feature Ledger Index

## Purpose

This is the index of all VRE feature-ledger files (active + archived) for
Phase 9. It exists so "which file contains `seq 247`?" is answerable in one
lookup instead of grepping every ledger file.

Exactly ONE file has `status = active` at any time. All others are
`archived` with a `closed` date.

## Index

| file | status | seq range | opened | closed | notes |
|---|---|---|---|---|---|
| `phase9-vre-feature-ledger.md` | active | `000–…` | 2026-04-21 | — | First ledger. Bootstrap row `000 = TRACKING-BOOTSTRAP`. Created by Wave 0 `T0.1a` after explicit operator GO. |

## Rotation Rule

When the active ledger reaches 400 rows, the next pass that appends new VRE
feature rows MUST prepare the successor file. Rotation is mandatory no later
than 500 rows. File size above 250 KB remains a secondary earlier trigger,
and explicit operator request may rotate earlier for readability. When
rotation fires, the sequence is atomic:

1. Close the current file by appending a trailing row with
   `feature id = LEDGER-ROTATION-NN` (where `NN` is the outgoing file
   number, `01` for the first rotation) and
   `notes = "continued in phase9-vre-feature-ledger-NN+1.md"`.
2. Open a new file `phase9-vre-feature-ledger-NN+1.md` with a leading row
   whose `seq` equals the next monotonic value after the last closed row,
   `feature id = LEDGER-ROTATION-CONTINUATION`,
   `notes = "continues from phase9-vre-feature-ledger-NN.md"`.
3. Update this index file: flip the outgoing file `status` from `active`
   to `archived`, fill its `closed` date, and add a new row for the
   incoming file with `status = active`.
4. Update the capability handshake operator surface
   (`vre.operatorSurface.artifactPaths`) to name the new active ledger
   path. Archived files remain readable but are no longer the write
   target.

Rows are never deleted or reordered. History is fully append-only across
all ledger files.

## Index Consistency Rules

CI (Wave 0 `T0.4a-ter`) raises `E_LEDGER_INDEX_INCONSISTENT` when any of:

- more than one row has `status = active`;
- there is a gap in `seq range` coverage between consecutive files;
- an `archived` file has no `closed` date;
- the `active` file in this index does not match the file actually being
  appended to by the latest CI run.
