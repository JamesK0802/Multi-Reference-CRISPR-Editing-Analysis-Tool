def find_target_in_reference(reference_seq, sgrna_seq):
    """
    Finds the starting index of the sgRNA within a reference sequence.
    Returns the index, or -1 if not found.
    """
    return reference_seq.find(sgrna_seq)

def calculate_cut_site(sgrna_start_index, sgrna_seq):
    """
    Calculates the exact Cas9 cut site (typically 3 base pairs upstream of the PAM).
    Assuming the PAM is sitting immediately after the 20bp sgRNA, 
    the cut site is at index (start_index + length(sgRNA) - 3).
    """
    # Cas9 cuts 3bp from the end of the sgRNA sequence
    cut_offset = len(sgrna_seq) - 3
    return sgrna_start_index + cut_offset

def extract_window(sequence, cut_site, window_size):
    """
    Extracts a small window of sequence around the calculated cut site.
    For example, window_size=20 means 10 bp before and 10 bp after the cut site.
    """
    half_window = window_size // 2
    start = max(0, cut_site - half_window)
    end = min(len(sequence), cut_site + half_window)
    
    return sequence[start:end]

def process_read(read_seq, sgrna_seq, window_size=20):
    """
    Very simple block to check if the read contains the sgRNA (exact match).
    If found, calculates cut site and extracts the window.
    """
    # For MVP, we do exact string matching.
    sgrna_start = read_seq.find(sgrna_seq)
    
    if sgrna_start == -1:
        return None, None # Target not found in this read
        
    cut_site = calculate_cut_site(sgrna_start, sgrna_seq)
    window = extract_window(read_seq, cut_site, window_size)
    
    return cut_site, window
