def reverse_complement(seq):
    """Returns the reverse complement of a DNA sequence."""
    complement = {'A': 'T', 'C': 'G', 'G': 'C', 'T': 'A', 'N': 'N',
                  'a': 't', 'c': 'g', 'g': 'c', 't': 'a'}
    return "".join(complement.get(base, 'N') for base in reversed(seq))


def find_target_in_reference(reference_seq, sgrna_seq):
    """
    Finds the starting index of the sgRNA within a reference sequence.
    Returns (start_index, is_rc).
    """
    idx = reference_seq.lower().find(sgrna_seq.lower())
    if idx != -1:
        return idx, False

    rc_sgrna = reverse_complement(sgrna_seq)
    idx_rc = reference_seq.lower().find(rc_sgrna.lower())
    if idx_rc != -1:
        print(f"[DEBUG] Target detected as Reverse Complement in reference at index {idx_rc}")
        return idx_rc, True

    return -1, False


def calculate_cut_site(sgrna_start_index, sgrna_seq, is_rc=False):
    """Calculates the Cas9 cut site (3bp upstream of PAM)."""
    if not is_rc:
        return sgrna_start_index + (len(sgrna_seq) - 3)
    else:
        return sgrna_start_index - 3


def extract_window(sequence, cut_site, window_size, quality_scores=None):
    """
    Extracts a fixed-size sequence window centered on cut_site.
    Used ONLY for the reference sequence window.
    """
    half_window = window_size // 2
    start = max(0, cut_site - half_window)
    end = min(len(sequence), cut_site + half_window)

    seq_win = sequence[start:end]
    if quality_scores is not None:
        qual_win = quality_scores[start:end]
        return seq_win, qual_win
    return seq_win


def process_read_with_anchors(read_seq, ref_window, quality_scores=None, anchor_len=12, check_rc=True):
    """
    CRISPRnano-compatible indel detection via flanking anchor sequences.

    WHY THIS IS NECESSARY:
        extract_window() produces same-length windows for both ref and read.
        Two strings of identical length always have net diff-length = 0, so
        difflib-based net_indel is mathematically always 0 → everything in_frame.
        Anchor-based extraction returns VARIABLE-LENGTH read_inner, so:
            net_indel = len(read_inner) - len(ref_inner)
        correctly reflects actual insertions / deletions.

    Args:
        read_seq:       raw read sequence (str)
        ref_window:     fixed reference window (str), e.g. 90 bp centered on cut site
        quality_scores: per-base Phred scores (list[int]) from BioPython parser, or None
        anchor_len:     bases taken from each end of ref_window as search anchors
        check_rc:       if True, automatically checks reverse complement if forward fails

    Returns:
        (ref_inner, read_inner, qual_inner)
            ref_inner:  reference inner region (ref_window with anchor_len trimmed each side)
            read_inner: read inner region — VARIABLE LENGTH, net_indel = len difference
            qual_inner: quality scores for read_inner, or None

        Returns (None, None, None) if anchors not found in read.
    """
    if len(ref_window) < anchor_len * 2 + 2:
        return None, None, None

    left_anchor  = ref_window[:anchor_len].lower()
    right_anchor = ref_window[-anchor_len:].lower()
    ref_inner    = ref_window[anchor_len:-anchor_len]

    def _find_anchored(seq, qual):
        seq_l = seq.lower()
        li = seq_l.find(left_anchor)
        if li == -1:
            return None, None, None
        # Search for right anchor AFTER the left anchor match
        ri = seq_l.find(right_anchor, li + anchor_len + 1)
        if ri == -1:
            return None, None, None
        read_inner = seq[li + anchor_len: ri]
        qual_inner = qual[li + anchor_len: ri] if qual is not None else None
        return ref_inner, read_inner, qual_inner

    # Try forward orientation
    result = _find_anchored(read_seq, quality_scores)
    if result[0] is not None or not check_rc:
        return result

    # Try reverse complement
    rc_seq  = reverse_complement(read_seq)
    rc_qual = list(reversed(quality_scores)) if quality_scores is not None else None
    return _find_anchored(rc_seq, rc_qual)


# ── Legacy helper kept for backward compatibility ──────────────────────────────
def process_read(read_seq, sgrna_seq, window_size=20, quality_scores=None):
    """
    Seed-based window extraction (legacy).
    NOTE: Returns same-length windows → do NOT use for indel classification.
    """
    seed = sgrna_seq[:12]

    def _extract(seq, qual):
        idx = seq.find(seed)
        if idx == -1:
            return None, None
        cut  = calculate_cut_site(idx, sgrna_seq, is_rc=False)
        half = window_size // 2
        start = max(0, cut - half)
        end   = min(len(seq), cut + half)
        win   = seq[start:end]
        q     = qual[start:end] if qual is not None else None
        return win, q

    res = _extract(read_seq, quality_scores)
    if res[0] is not None:
        return res

    rc    = reverse_complement(read_seq)
    rc_q  = list(reversed(quality_scores)) if quality_scores is not None else None
    return _extract(rc, rc_q)
