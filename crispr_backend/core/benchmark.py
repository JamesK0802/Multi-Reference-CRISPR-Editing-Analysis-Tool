"""
benchmark.py — Classification Benchmarking for Multi-Gene/Target FASTQ reads.

This module performs read-to-gene/target classification benchmarking ONLY.
It does NOT compute CRISPR indels, frameshifts, or mutation groups.
"""

import random
from typing import List, Dict, Tuple, Optional, Union
from core import classifier


# ─────────────────────────────────────────────────────────────────────────────
# Refactor to use Classifier Core
# ─────────────────────────────────────────────────────────────────────────────

def _to_str(seq) -> str: return classifier._to_str(seq)
def reverse_complement(seq) -> str: return classifier.reverse_complement(seq)
def avg_phred(qual) -> float: return classifier.avg_phred(qual)
def find_grna_cut_site(reference, grna): return classifier.find_grna_cut_site(reference, grna)
def _extract_window(reference, cut_site, window): return classifier.extract_window(reference, cut_site, window)
def is_read_usable(seq, qual, ref_win, phred): return classifier.is_read_usable(seq, qual, ref_win, phred)
def score_read_against_window(read, ref_win): return classifier.score_read_against_window(read, ref_win)

def classify_read(read_seq, read_qual, targets_info: List[Dict], phred_threshold: float, margin: float) -> Dict:
    """Classify using unified core."""
    return classifier.apply_classification(read_seq, read_qual, targets_info, phred_threshold, margin)


# ─────────────────────────────────────────────────────────────────────────────
# Main Entry Points
# ─────────────────────────────────────────────────────────────────────────────

def run_split_preview(dataset: List[Dict], seed: int = 42) -> Dict:
    """
    Preview train/test split counts ONLY.
    Does NOT touch gRNA, reference, or cut-site logic.
    """
    random.seed(seed)
    rows = []
    for row in dataset:
        total     = len(row.get('reads', []))
        train_cnt = int(total * 0.8)
        rows.append({
            'gene':        row.get('gene', ''),
            'target':      row.get('target', ''),
            'total':       total,
            'train_count': train_cnt,
            'test_count':  total - train_cnt
        })
    return {
        'rows':        rows,
        'total':       sum(r['total']       for r in rows),
        'train_count': sum(r['train_count'] for r in rows),
        'test_count':  sum(r['test_count']  for r in rows)
    }


def run_benchmark(
    dataset: List[Dict],
    phred_threshold: float,
    window: int,
    margin: float,
    subset: str = 'train',
    seed: int = 42,
    progress_callback=None
) -> Dict:
    """
    Full benchmark pipeline with read eligibility matching single-reference analysis.
    """
    random.seed(seed)
    total_rows = len(dataset)

    def progress(pct, msg):
        if progress_callback: progress_callback(pct, msg)
        print(f"[BENCHMARK] {pct}% — {msg}")

    # ── Step 1: Derive cut sites + reference windows ───────────────────────────
    progress(5, "Deriving cut sites from gRNA + PAM…")
    cut_site_info = {}
    targets_info_map = {}

    for i, row in enumerate(dataset):
        key = (row['gene'], row['target'])
        ref_str = _to_str(row['reference']).upper()
        grna_str = _to_str(row['grna']).upper()
        ci = find_grna_cut_site(ref_str, grna_str)
        ref_win = _extract_window(ref_str, ci['cut_site'], window)

        cut_site_info[key] = ci
        targets_info_map[key] = {
            'gene': row['gene'],
            'target': row['target'],
            'ref_window': ref_win
        }
        progress(5 + int((i + 1) / total_rows * 10),
                 f"Cut site: {row['gene']} › {row['target']} "
                 f"({ci['strand']}, pos {ci['cut_site']}, PAM={'✓' if ci['pam_found'] else '✗ fallback'})")

    targets_list = list(targets_info_map.values())

    # ── Steps 2-3: Tag reads, split per file ──────────────────────────────────
    progress(15, "Tagging and splitting reads…")
    all_reads = []
    split_info = []
    cut_site_report = []

    for i, row in enumerate(dataset):
        key = (row['gene'], row['target'])
        ci = cut_site_info[key]

        reads_tagged = [
            {
                'seq': _to_str(r[0]),
                'qual': r[1],
                'true_gene': row['gene'],
                'true_target': row['target']
            }
            for r in row['reads']
        ]

        random.shuffle(reads_tagged)
        split_idx = int(len(reads_tagged) * 0.8)
        train_part = reads_tagged[:split_idx]
        test_part = reads_tagged[split_idx:]

        split_info.append({
            'gene': row['gene'],
            'target': row['target'],
            'total': len(reads_tagged),
            'train_count': len(train_part),
            'test_count': len(test_part)
        })
        cut_site_report.append({
            'gene': row['gene'],
            'target': row['target'],
            'strand': ci['strand'],
            'cut_site': ci['cut_site'],
            'grna_start': ci['grna_start'],
            'grna_end': ci['grna_end'],
            'pam': ci['pam'],
            'pam_found': ci['pam_found']
        })

        if subset == 'train': all_reads.extend(train_part)
        else: all_reads.extend(test_part)

    total_reads = len(all_reads)
    if total_reads == 0:
        return {'error': 'No reads in selected subset'}

    # ── Step 4: Classify ───────────────────────────────────────────────────────
    progress(25, f"Classifying {total_reads:,} reads ({subset} subset)…")

    counts = {
        'total': total_reads,
        'filtered': 0,
        'usable': 0,
        'correct': 0,
        'wrong': 0,
        'ambiguous': 0,
        'fail_no_anchor': 0,
        'fail_quality': 0,
        'fail_similarity': 0
    }

    per_class_metrics = {}
    for t in targets_list:
        per_class_metrics[(t['gene'], t['target'])] = {
            'gene': t['gene'], 'target': t['target'],
            'true_total': 0, 'correct': 0, 'wrong': 0, 'ambiguous': 0, 'filtered': 0
        }

    batch_size = 500
    for i in range(0, total_reads, batch_size):
        batch = all_reads[i : i + batch_size]
        for r in batch:
            class_key = (r['true_gene'], r['true_target'])
            per_class_metrics[class_key]['true_total'] += 1

            # USE UNIFIED CLASSIFIER
            res = classify_read(r['seq'], r['qual'], targets_list, phred_threshold, margin)

            if not res['assigned']:
                if res.get('reason') == 'filtered':
                    # Find specific reason (redundant score but keep for metrics)
                    # For metrics, we check against the TRUE window
                    true_win = targets_info_map[class_key]['ref_window']
                    _, fail_reason, _ = is_read_usable(r['seq'], r['qual'], true_win, phred_threshold)
                    counts['filtered'] += 1
                    counts[f'fail_{fail_reason}'] += 1
                    per_class_metrics[class_key]['filtered'] += 1
                else:
                    counts['usable'] += 1
                    counts['ambiguous'] += 1
                    per_class_metrics[class_key]['ambiguous'] += 1
            else:
                counts['usable'] += 1
                if res['predicted_gene'] == r['true_gene'] and res['predicted_target'] == r['true_target']:
                    counts['correct'] += 1
                    per_class_metrics[class_key]['correct'] += 1
                else:
                    counts['wrong'] += 1
                    per_class_metrics[class_key]['wrong'] += 1

        if (i // batch_size) % 10 == 0:
            progress(25 + int((i / total_reads) * 70), f"Classified {i + len(batch):,} / {total_reads:,} reads")

    # ── Finalize & Format ─────────────────────────────────────────────────────
    progress(100, "Benchmark complete")
    
    # Global usability rates
    usable_cnt = counts['usable']
    total_cnt  = counts['total']
    usable_rate = round(usable_cnt / total_cnt * 100, 1) if total_cnt > 0 else 0
    
    # Global accuracy rates (over usable reads)
    correct_rate   = round(counts['correct'] / usable_cnt * 100, 1) if usable_cnt > 0 else 0
    wrong_rate     = round(counts['wrong'] / usable_cnt * 100, 1) if usable_cnt > 0 else 0
    ambiguous_rate = round(counts['ambiguous'] / usable_cnt * 100, 1) if usable_cnt > 0 else 0

    formatted_per_class = []
    for m in per_class_metrics.values():
        c_total = m['true_total']
        c_usable = m['correct'] + m['wrong'] + m['ambiguous']
        m['total'] = c_total
        m['correct_rate'] = round(m['correct'] / c_usable * 100, 1) if c_usable > 0 else 0
        formatted_per_class.append(m)

    return {
        # Global Totals
        'total':             total_cnt,
        'total_reads':       total_cnt,
        'usable':            usable_cnt,
        'usable_reads':      usable_cnt,
        'usable_rate':       usable_rate,
        'filtered_out':      counts['filtered'],
        'filtered':          counts['filtered'],
        
        # Accuracy Counts
        'correct':           counts['correct'],
        'correct_count':     counts['correct'],
        'wrong':             counts['wrong'],
        'wrong_count':       counts['wrong'],
        'ambiguous':         counts['ambiguous'],
        'ambiguous_count':   counts['ambiguous'],
        
        # Accuracy Rates
        'correct_rate':      correct_rate,
        'wrong_rate':        wrong_rate,
        'ambiguous_rate':    ambiguous_rate,
        
        # Detail Counts
        'fail_no_anchor':    counts['fail_no_anchor'],
        'fail_quality':      counts['fail_quality'],
        'fail_similarity':   counts['fail_similarity'],
        
        'per_class':         formatted_per_class,
        'split_info':        split_info,
        'cut_sites':         cut_site_report
    }
