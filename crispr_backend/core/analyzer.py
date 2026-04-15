import difflib

def compare_windows(ref_window, read_window):
    """
    Compares the reference window and read window.
    Returns True if they are perfectly identical.
    """
    return ref_window == read_window

def classify_mutation(ref_window, read_window):
    """
    Naive classification of the read window using Python's built-in difflib.
    Real CRISPR tools use Needleman-Wunsch or Smith-Waterman algorithms.
    This simple version looks at the basic string operations needed to turn 
    the reference window into the read window.
    """
    if compare_windows(ref_window, read_window):
        return "unmodified"
        
    # SequenceMatcher finds the longest contiguous matching subsequences
    matcher = difflib.SequenceMatcher(None, ref_window, read_window)
    opcodes = matcher.get_opcodes()
    
    # Check what kind of string operations were found ('insert', 'delete', 'replace', or 'equal')
    has_insert = any(tag == 'insert' for tag, i1, i2, j1, j2 in opcodes)
    has_delete = any(tag == 'delete' for tag, i1, i2, j1, j2 in opcodes)
    has_replace = any(tag == 'replace' for tag, i1, i2, j1, j2 in opcodes)
    
    # Note: Because both windows are fixed at 20bp, an insertion pushes letters 
    # out of the window, causing an artificial deletion at the edge. 
    # This logic identifies strict singular actions well, but mixed ones become 'complex'.
    if has_replace and not has_insert and not has_delete:
        return "substitution"
    elif has_insert and not has_delete and not has_replace:
        return "insertion"
    elif has_delete and not has_insert and not has_replace:
        return "deletion"
    else:
        # If it's a mix of operations (e.g. an insert that caused a deletion shift at the edge)
        return "complex_modified"
