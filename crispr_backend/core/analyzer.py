import difflib

def compare_windows(ref_window, read_window):
    """
    Compares the reference window and read window.
    Returns True if they are perfectly identical.
    """
    return ref_window == read_window

def classify_mutation(ref_window, read_window):
    """
    Classification of the read window using difflib.
    Returns: wildtype, substitution, insertion, deletion, mixed
    """
    if compare_windows(ref_window, read_window):
        print("[DEBUG] Read classified as wildtype")
        return "wildtype"
        
    # SequenceMatcher finds the differences between current read and reference
    matcher = difflib.SequenceMatcher(None, ref_window, read_window)
    opcodes = matcher.get_opcodes()
    
    # Check what kind of string operations were found ('insert', 'delete', 'replace', or 'equal')
    has_insert = any(tag == 'insert' for tag, i1, i2, j1, j2 in opcodes)
    has_delete = any(tag == 'delete' for tag, i1, i2, j1, j2 in opcodes)
    has_replace = any(tag == 'replace' for tag, i1, i2, j1, j2 in opcodes)
    
    # Track types specifically for logging
    detected_types = []
    if has_insert: detected_types.append("insertion")
    if has_delete: detected_types.append("deletion")
    if has_replace: detected_types.append("substitution")

    # Final Classification Logic
    if len(detected_types) > 1:
        result = "mixed"
    elif has_insert:
        result = "insertion"
        print("[DEBUG] Indel detected: Insertion")
    elif has_delete:
        result = "deletion"
        print("[DEBUG] Indel detected: Deletion")
    elif has_replace:
        result = "substitution"
    else:
        result = "wildtype" # Fallback

    print(f"[DEBUG] Read classified as {result} ({', '.join(detected_types)})")
    return result
