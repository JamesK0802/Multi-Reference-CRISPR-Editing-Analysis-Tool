"""
classifier.py — Shared Classification Core for CRISPR Analysis and Benchmarking.

Provides unified logic for:
1. Cut-site and reference window extraction.
2. Read usability filtering (Phred, anchors, similarity).
3. Read-to-class scoring (k-mer based).
4. Class assignment (margin logic and single-class handling).
"""

import difflib
import statistics
import random
from typing import List, Dict, Tuple, Optional, Any

# ─────────────────────────────────────────────────────────────────────────────
# Constants (Synced with single-reference pipeline standards)
# ─────────────────────────────────────────────────────────────────────────────

ANCHOR_LEN = 12
INNER_SIMILARITY_MIN = 0.85

# ─────────────────────────────────────────────────────────────────────────────
# Type Helpers & Basic Utilities
# ─────────────────────────────────────────────────────────────────────────────

def _to_str(seq) -> str:
    if isinstance(seq, str):
        return seq
    if isinstance(seq, (bytes, bytearray)):
        return seq.decode('ascii', errors='replace')
    return str(seq)

def reverse_complement(seq) -> str:
    seq_str = _to_str(seq).upper()
    comp = {'A': 'T', 'T': 'A', 'G': 'C', 'C': 'G', 'N': 'N'}
    return ''.join(comp.get(b, 'N') for b in reversed(seq_str))

def avg_phred(qual) -> float:
    if not qual:
        return 40.0
    if isinstance(qual, (list, tuple)):
        if not qual: return 40.0
        return (sum(qual) / len(qual)) if isinstance(qual[0], int) else \
               sum(ord(c) - 33 for c in qual) / len(qual)
    if isinstance(qual, (bytes, bytearray)):
        return sum(b - 33 for b in qual) / len(qual)
    if isinstance(qual, str):
        return sum(ord(c) - 33 for c in qual) / len(qual)
    return 40.0

# ─────────────────────────────────────────────────────────────────────────────
# Reference Optimization
# ─────────────────────────────────────────────────────────────────────────────

def find_grna_cut_site(reference: str, grna: str) -> Dict[str, Any]:
    """Finds gRNA and calculates cut site in ref coordinates."""
    ref_up = _to_str(reference).upper()
    grna_up = _to_str(grna).upper()
    grna_rc = reverse_complement(grna_up)
    ref_len, grna_len = len(ref_up), len(grna_up)

    if grna_len == 0:
        return {'strand': 'unknown', 'grna_start': -1, 'grna_end': -1, 'cut_site': ref_len // 2, 'pam': 'N/A', 'pam_found': False}

    # Forward: gRNA + [NGG]
    for pos in range(ref_len - grna_len):
        if ref_up[pos:pos+grna_len] == grna_up:
            ps = pos + grna_len
            if ps + 3 <= ref_len:
                pam = ref_up[ps:ps+3]
                if pam[1] == 'G' and pam[2] == 'G':
                    return {'strand': 'forward', 'grna_start': pos, 'grna_end': pos + grna_len, 
                            'cut_site': pos + grna_len - 3, 'pam': pam, 'pam_found': True}

    # Reverse: [CCN] + gRNA_RC
    for pos in range(ref_len - len(grna_rc)):
        if ref_up[pos:pos+len(grna_rc)] == grna_rc:
            pe = pos
            ps = pe - 3
            if ps >= 0:
                pam = ref_up[ps:pe]
                if pam[0] == 'C' and pam[1] == 'C':
                    return {'strand': 'reverse', 'grna_start': pos, 'grna_end': pos + len(grna_rc),
                            'cut_site': pos + 3, 'pam': pam, 'pam_found': True}

    # Fallback midpoint
    idx = ref_up.find(grna_up)
    if idx != -1: 
        return {'strand': 'forward', 'grna_start': idx, 'grna_end': idx + grna_len,
                'cut_site': idx + grna_len - 3, 'pam': 'NOT_FOUND', 'pam_found': False}
    idx = ref_up.find(grna_rc)
    if idx != -1: 
        return {'strand': 'reverse', 'grna_start': idx, 'grna_end': idx + len(grna_rc),
                'cut_site': idx + 3, 'pam': 'NOT_FOUND', 'pam_found': False}
    
    return {'strand': 'unknown', 'grna_start': -1, 'grna_end': -1, 'cut_site': ref_len // 2, 'pam': 'N/A', 'pam_found': False}

def extract_window(reference: str, cut_site: int, window_size: int) -> str:
    half = window_size // 2
    start = max(0, cut_site - half)
    end = min(len(reference), cut_site + half)
    return reference[start:end]

# ─────────────────────────────────────────────────────────────────────────────
# Usability Filter
# ─────────────────────────────────────────────────────────────────────────────

def _eval_anchors(seq: str, qual, ref_window: str, phred_threshold: float) -> Dict:
    """Attempts to extract inner region from one strand orientation."""
    if len(ref_window) < ANCHOR_LEN * 2 + 2:
        return {'fail': 'no_anchor'}

    left_anchor = ref_window[:ANCHOR_LEN].lower()
    right_anchor = ref_window[-ANCHOR_LEN:].lower()
    ref_inner = ref_window[ANCHOR_LEN:-ANCHOR_LEN]

    seq_l = seq.lower()
    li = seq_l.find(left_anchor)
    if li == -1: return {'fail': 'no_anchor'}
    ri = seq_l.find(right_anchor, li + ANCHOR_LEN + 1)
    if ri == -1: return {'fail': 'no_anchor'}

    read_inner = seq[li + ANCHOR_LEN: ri]
    
    # Phred check
    if qual is not None:
        inner_qual = qual[li + ANCHOR_LEN: ri]
        if inner_qual:
            avg_q = statistics.mean(inner_qual) if isinstance(inner_qual[0], int) else \
                    sum(ord(c) - 33 for c in inner_qual) / len(inner_qual)
            if avg_q < phred_threshold:
                return {'fail': 'quality'}

    # Similarity check
    shorter = ref_inner if len(ref_inner) <= len(read_inner) else read_inner
    longer  = read_inner if len(ref_inner) <= len(read_inner) else ref_inner
    sim = difflib.SequenceMatcher(None, shorter, longer).ratio()

    return {'fail': None, 'ref_inner': ref_inner, 'read_inner': read_inner, 'sim': sim}

def is_read_usable(seq: str, qual, ref_window: str, phred_threshold: float) -> Tuple[bool, str, Optional[Dict]]:
    """Tries fwd and RC. Returns (usable, reason, best_res_dict)."""
    fw_res = _eval_anchors(seq, qual, ref_window, phred_threshold)
    rc_seq = reverse_complement(seq)
    rc_qual = list(reversed(qual)) if isinstance(qual, (list, tuple)) else None
    rc_res = _eval_anchors(rc_seq, rc_qual, ref_window, phred_threshold)

    best_res = None
    is_rc = False
    if fw_res['fail'] is None and rc_res['fail'] is None:
        if rc_res['sim'] > fw_res['sim']:
            best_res = rc_res
            is_rc = True
        else:
            best_res = fw_res
    elif fw_res['fail'] is None: best_res = fw_res
    elif rc_res['fail'] is None: 
        best_res = rc_res
        is_rc = True

    if best_res is None:
        reason = 'quality' if (fw_res.get('fail') == 'quality' or rc_res.get('fail') == 'quality') else 'no_anchor'
        return False, reason, None

    if best_res['sim'] < INNER_SIMILARITY_MIN:
        return False, 'similarity', None

    best_res['is_rc'] = is_rc
    return True, 'ok', best_res

# ─────────────────────────────────────────────────────────────────────────────
# Scoring & Classification
# ─────────────────────────────────────────────────────────────────────────────

def score_read_against_window(read: str, ref_window: str, k: int = 10) -> float:
    """k-mer based window overlap score."""
    read_up = _to_str(read).upper()
    ref_up = _to_str(ref_window).upper()
    if not read_up or not ref_up: return 0.0
    if len(read_up) < k or len(ref_up) < k:
        return difflib.SequenceMatcher(None, read_up, ref_up).ratio()

    ref_kmers = set(ref_up[i:i+k] for i in range(len(ref_up)-k+1) if 'N' not in ref_up[i:i+k])
    
    hits = 0
    total = 0
    for strand in (read_up, reverse_complement(read_up)):
        for i in range(len(strand)-k+1):
            kmer = strand[i:i+k]
            if 'N' not in kmer:
                total += 1
                if kmer in ref_kmers: hits += 1
    return hits / max(total, 1)

def apply_classification(
    read_seq: str, 
    read_qual: Any, 
    classes: List[Dict], 
    phred_threshold: float,
    margin: float
) -> Dict:
    """
    Unified entry point for classification.
    classes: List of { gene, target, ref_window }
    """
    # 1. Usability Filtering
    # We check usability against ALL classes. 
    # A read must be usable for AT LEAST one candidate class to be considered.
    eligible_classes = []
    for c in classes:
        usable, _, _ = is_read_usable(read_seq, read_qual, c['ref_window'], phred_threshold)
        if usable:
            eligible_classes.append(c)
    
    if not eligible_classes:
        return {'assigned': False, 'reason': 'filtered'}

    # 2. Scoring
    scores = sorted(
        [(score_read_against_window(read_seq, c['ref_window']), c['gene'], c['target'])
         for c in eligible_classes],
        reverse=True
    )
    
    # 3. Assignment
    top1_score, top1_gene, top1_target = scores[0]

    # Handle Single-Class Special Case
    if len(classes) == 1:
        # If it passed usability for this one class, we assign it regardless of margin
        return {
            'assigned': True, 
            'predicted_gene': top1_gene, 
            'predicted_target': top1_target,
            'top1_score': round(top1_score, 4)
        }

    # Normal Multi-Class Margin Logic
    top2_score = scores[1][0] if len(scores) > 1 else 0.0
    gap = top1_score - top2_score
    
    if gap >= margin:
        return {
            'assigned': True, 
            'predicted_gene': top1_gene, 
            'predicted_target': top1_target,
            'top1_score': round(top1_score, 4),
            'top2_score': round(top2_score, 4),
            'gap': round(gap, 4)
        }
    
    return {'assigned': False, 'reason': 'ambiguous', 'top1_score': round(top1_score, 4)}
