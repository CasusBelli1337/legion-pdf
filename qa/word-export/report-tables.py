#!/usr/bin/env python3
"""Formats the fidelity suite's JSON reports as the Markdown tables the build
report quotes: one row per corpus fixture, one per private filing.

    python3 qa/word-export/report-tables.py qa/output/word-export <private-report-dir>
"""
import glob
import json
import os
import sys


def corpus_rows(out_dir):
    rows = ["| fixture | pages | words off (all pages) | worst page median dy | worst page p95 dy | line numbers off |", "| --- | --- | --- | --- | --- | --- |"]
    for f in sorted(glob.glob(os.path.join(out_dir, "*.fidelity.json"))):
        d = json.load(open(f))
        fid = d["fidelity"]
        words = sum(len(p["missing"]) + len(p["extra"]) for p in fid["pages"])
        median = max(p["medianDy"] for p in fid["pages"])
        p95 = max(p["p95Dy"] for p in fid["pages"])
        numbers = [n for p in fid["pages"] for n in p["lineNumbers"]]
        off = sum(1 for n in numbers if n["dy"] is None or abs(n["dy"]) > 0.5)
        name = os.path.basename(f).replace(".fidelity.json", "")
        rows.append(f"| {name} | {fid['sourcePages']} → {fid['exportedPages']} | {words} | {median:.2f} pt | {p95:.2f} pt | {off} of {len(numbers)} |")
    return "\n".join(rows)


def private_rows(report_dir):
    path = os.path.join(report_dir, "SUMMARY.md")
    return open(path).read().strip() if os.path.exists(path) else "(no private report)"


if __name__ == "__main__":
    print(corpus_rows(sys.argv[1]))
    print()
    print(private_rows(sys.argv[2]))
