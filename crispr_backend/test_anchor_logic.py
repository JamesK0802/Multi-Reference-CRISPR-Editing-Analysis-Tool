def find_best_anchors(seq, left_anchor, right_anchor, target_inner_len):
    ANCHOR_LEN = len(left_anchor)
    left_indices = []
    idx = seq.find(left_anchor)
    while idx != -1:
        left_indices.append(idx)
        idx = seq.find(left_anchor, idx + 1)
        
    right_indices = []
    idx = seq.find(right_anchor)
    while idx != -1:
        right_indices.append(idx)
        idx = seq.find(right_anchor, idx + 1)
        
    if not left_indices or not right_indices:
        return -1, -1
        
    best_li, best_ri = -1, -1
    best_diff = float('inf')
    
    for li in left_indices:
        for ri in right_indices:
            if ri >= li + ANCHOR_LEN:
                inner_len = ri - (li + ANCHOR_LEN)
                diff = abs(inner_len - target_inner_len)
                if diff < best_diff:
                    best_diff = diff
                    best_li = li
                    best_ri = ri
                    
    return best_li, best_ri

seq = "ABC123DEF456DEF789DEF"
left = "ABC"
right = "DEF"
target = 10
li, ri = find_best_anchors(seq, left, right, target)
print(f"li: {li}, ri: {ri}")
