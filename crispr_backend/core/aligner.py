def reverse_complement(seq):
    """
    Returns the reverse complement of a DNA sequence.
    """
    complement = {'A': 'T', 'C': 'G', 'G': 'C', 'T': 'A', 'N': 'N', 'a': 't', 'c': 'g', 'g': 'c', 't': 'a'}
    return "".join(complement.get(base, base) for base in reversed(seq))

def find_target_in_reference(reference_seq, sgrna_seq):
    """
    Finds the starting index of the sgRNA within a reference sequence.
    Returns (start_index, is_rc).
    """
    # Try forward first
    idx = reference_seq.lower().find(sgrna_seq.lower())
    if idx != -1:
        return idx, False
        
    # Try reverse complement
    rc_sgrna = reverse_complement(sgrna_seq)
    idx_rc = reference_seq.lower().find(rc_sgrna.lower())
    if idx_rc != -1:
        print(f"[DEBUG] Target detected as Reverse Complement in reference at index {idx_rc}")
        return idx_rc, True
        
    return -1, False

def calculate_cut_site(sgrna_start_index, sgrna_seq, is_rc=False):
    """
    Calculates the Cas9 cut site.
    If is_rc is True, the gRNA in the sequence is the RC version.
    Forward: [start]...[cut]...PAM
    Reverse: PAM...[cut]...[start]
    """
    if not is_rc:
        # Standard: Cut is 3bp upstream of PAM (PAM follows 20bp gRNA)
        cut_offset = len(sgrna_seq) - 3
        return sgrna_start_index + cut_offset
    else:
        # RC: PAM is at the "start" (lower index) side of the RC(gRNA).
        # Cut site is 3bp downstream of PAM.
        # RC(gRNA) = RC(G)
        # Sequence: [PAM(3bp)][CutSite]...[RC(G)]
        # However, for simplicity in matching, if we find RC(G) at idx,
        # the cut site relative to the start of RC(G) is 3bp into the sequence?
        # Actually, let's look at the mapping:
        # G (Forward):  5' [17bp] [Cut] [3bp] [PAM] 3'
        # RC(G):        3' [PAM] [3bp] [Cut] [17bp] 5'  (Reading 5' to 3' on bottom strand)
        # On the top strand, it looks like: [RC(PAM)] [3bp] [Cut] [RC(G)]
        # So cut site is 3bp before the start of RC(gRNA).
        return sgrna_start_index + 3

def extract_window(sequence, cut_site, window_size):
    """
    Extracts a small window of sequence around the calculated cut site.
    """
    half_window = window_size // 2
    start = max(0, cut_site - half_window)
    end = min(len(sequence), cut_site + half_window)
    return sequence[start:end]

def process_read(read_seq, sgrna_seq, window_size=20):
    """
    Finds the target using a 12bp seed from the start of the sgRNA.
    Checks both forward and RC orientations.
    Returns cut_site, window
    """
    seed = sgrna_seq[:12]
    rc_seed = reverse_complement(sgrna_seq[-12:]) # RC of the end is seed of the RC
    
    # Check forward
    idx = read_seq.find(seed)
    if idx != -1:
        cut_site = calculate_cut_site(idx, sgrna_seq, is_rc=False)
        window = extract_window(read_seq, cut_site, window_size)
        return cut_site, window

    # Check reverse complement of read
    rc_read = reverse_complement(read_seq)
    idx_rc = rc_read.find(seed)
    if idx_rc != -1:
        # We handle RC by RC-ing the read and treating it as forward
        cut_site = calculate_cut_site(idx_rc, sgrna_seq, is_rc=False)
        window = extract_window(rc_read, cut_site, window_size)
        return cut_site, window
        
    return None, None
