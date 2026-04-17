def classify_mutation_with_alignment(ref_seq, read_seq):
    """
    CRISPRnano-standard mutation classification using exact alignment lengths.
    Calculates net_indel = insertion_length - deletion_length across all events.
    Returns: (category, has_sub, net_indel, tokens)
    """
    tokens = align_read_to_ref(ref_seq, read_seq)
    
    ins_len = sum(len(t["val"]) for t in tokens if t["type"] == "insert")
    del_len = sum(len(t["val"]) for t in tokens if t["type"] == "delete")
    sub_count = sum(len(t["val"]) for t in tokens if t["type"] == "substitute")
    
    net_indel = ins_len - del_len
    has_sub = (sub_count > 0)
    
    if ins_len == 0 and del_len == 0:
        category = "no_indel"
    else:
        if net_indel % 3 == 0:
            category = "in_frame"
        else:
            category = "out_of_frame"
            
    return category, has_sub, net_indel, tokens

from difflib import SequenceMatcher

def align_read_to_ref(ref_seq, read_seq):
    """
    Creates an array of alignment tokens for frontend rendering.
    Each token represents a block or a single character matching the reference,
    so the frontend can render it monospaced perfectly aligned to the reference.
    """
    matcher = SequenceMatcher(None, ref_seq, read_seq)
    tokens = []
    
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            tokens.append({"type": "equal", "val": read_seq[j1:j2]})
        elif tag == 'replace':
            ref_chunk = ref_seq[i1:i2]
            read_chunk = read_seq[j1:j2]
            
            # Normalize complex replacements into 1:1 substitutions + trailing indels
            # SequenceMatcher replaces a block with a block, which might not be equal length.
            for idx in range(max(len(ref_chunk), len(read_chunk))):
                if idx < len(ref_chunk) and idx < len(read_chunk):
                    # 1:1 substitution
                    tokens.append({"type": "substitute", "val": read_chunk[idx]})
                elif idx < len(ref_chunk):
                    # Read is shorter -> gap in read
                    tokens.append({"type": "delete", "val": "-"})
                else:
                    # Read is longer -> insertion in read
                    # This insert belongs to the current "position" between reference bases
                    tokens.append({"type": "insert", "val": read_chunk[idx]})
        elif tag == 'delete':
            # read is missing these bases (gap)
            tokens.append({"type": "delete", "val": "-" * (i2 - i1)})
        elif tag == 'insert':
            # read has extra bases
            tokens.append({"type": "insert", "val": read_seq[j1:j2]})
            
    return tokens
