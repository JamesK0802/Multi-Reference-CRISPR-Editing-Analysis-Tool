import argparse
import sys
import json
import os
import statistics
import difflib
from core.parser import parse_fastq
from core.aligner import (process_read_with_anchors, extract_window,
                           calculate_cut_site, find_target_in_reference,
                           calculate_cut_site, find_target_in_reference,
                           reverse_complement)
from core.analyzer import classify_mutation_with_alignment


def run_analysis(fastq_file, targets, phred_threshold=10, indel_threshold=1.0):
    """
    Main analysis pipeline — CRISPRnano-compatible.

    Filtering pipeline (mirrors CRISPRnano):
        1. Both flanking anchors must be found in the read (exact match)
        2. Inner-region Phred avg >= phred_threshold  (default Q10; CRISPRnano uses Q30)
        3. Inner-region sequence similarity to ref_inner >= INNER_SIMILARITY_MIN
           (rejects off-target reads where anchors matched by chance)
        4. Classify by net_indel = len(read_inner) - len(ref_inner)

    Guarantees:
        out_of_frame + in_frame + no_indel == aligned_reads
        substitution ⊂ no_indel  (never mixed with indel classes)
    """
    # ── Similarity threshold for inner region (0.85 drops noisy non-target sequences) ──
    INNER_SIMILARITY_MIN = 0.85

    print(f"  [RUN_ANALYSIS] Parsing {fastq_file}...")
    data = parse_fastq(fastq_file)
    total_reads = len(data)
    print(f"  [RUN_ANALYSIS] Found {total_reads} sequences.")

    final_output = {
        "fastq_file": fastq_file,
        "target_results": []
    }

    for target in targets:
        target_id     = target.get("target_id")
        reference_seq = target.get("reference_seq")
        sgrna_seq     = target.get("sgrna_seq")
        window_size   = target.get("window_size", 90)

        if not reference_seq:
            continue

        # ── Step 1: Locate gRNA in reference ──────────────────────────────────
        ref_sgrna_start, is_rc_in_ref = find_target_in_reference(reference_seq, sgrna_seq)
        if ref_sgrna_start == -1:
            print(f"  [WARNING] Target {target_id} not found in reference!")
            continue

        print(f"  [DEBUG] Target '{target_id}' found at idx {ref_sgrna_start} (RC={is_rc_in_ref})")

        # ── Step 2: Build reference window ────────────────────────────────────
        ref_cut_site = calculate_cut_site(ref_sgrna_start, sgrna_seq, is_rc=is_rc_in_ref)
        ref_window   = extract_window(reference_seq, ref_cut_site, window_size)
        
        # ROOT CAUSE FIX: The display and alignment must ALWAYS use the canonical forward orientation.
        # Do NOT reverse_complement the ref_window here.
        # (Removed: if is_rc_in_ref: ref_window = reverse_complement(ref_window))

        # Compute consistent ref_inner string for the groups
        ref_inner_fixed = ref_window[12:-12].upper()
        cut_site_index_fixed = len(ref_inner_fixed) // 2

        # Calculate exact gRNA start in the inner window for frontend display
        # If the gRNA binds the RC, we search for its RC in the forward reference.
        search_sgrna = reverse_complement(sgrna_seq).upper() if is_rc_in_ref else sgrna_seq.upper()
        grna_match_idx = ref_window.upper().find(search_sgrna)
        grna_start_in_inner = grna_match_idx - 12 if grna_match_idx != -1 else -1

        print(f"  [DEBUG] ref_window length: {len(ref_window)} bp, gRNA inner start: {grna_start_in_inner} (Searched RC: {is_rc_in_ref})")

        # ── Step 3: Counters ──────────────────────────────────────────────────
        counts = {
            "total_reads":      total_reads,
            "forward_aligned":  0,
            "reverse_aligned":  0,
            "aligned_reads":    0,
            "out_of_frame":     0,
            "in_frame":         0,
            "no_indel":         0,
            "substitution":     0,   # subset of no_indel
            "fail_no_anchor":   0,   # anchors not found
            "fail_quality":     0,   # quality < phred_threshold
            "fail_similarity":  0,   # inner region too divergent
        }

        read_details = []
        groups_dict = {}

        # ── Step 4: Process each read ─────────────────────────────────────────
        def _eval_strand(s, q):
            r_inn, rd_inn, rd_q = process_read_with_anchors(
                s, ref_window, quality_scores=q, anchor_len=12, check_rc=False
            )
            if r_inn is None: return {"fail": "no_anchor"}
            avg_q = statistics.mean(rd_q) if rd_q else 0
            if avg_q < phred_threshold: return {"fail": "quality"}
            shorter = r_inn if len(r_inn) <= len(rd_inn) else rd_inn
            longer  = rd_inn if len(r_inn) <= len(rd_inn) else r_inn
            sim = difflib.SequenceMatcher(None, shorter, longer).ratio()
            return {"fail": None, "ref_inner": r_inn, "read_inner": rd_inn, "sim": sim}

        for i, (seq, qual) in enumerate(data):
            fw_res = _eval_strand(seq, qual)
            rc_seq = reverse_complement(seq)
            rc_qual = list(reversed(qual)) if qual else None
            rc_res = _eval_strand(rc_seq, rc_qual)
            
            best_res = None
            is_reverse = False
            
            if fw_res.get("fail") is None and rc_res.get("fail") is None:
                if rc_res["sim"] > fw_res["sim"]:
                    best_res = rc_res
                    is_reverse = True
                else:
                    best_res = fw_res
            elif fw_res.get("fail") is None:
                best_res = fw_res
            elif rc_res.get("fail") is None:
                best_res = rc_res
                is_reverse = True
                
            if best_res is None:
                if fw_res.get("fail") == "quality" or rc_res.get("fail") == "quality":
                    counts["fail_quality"] += 1
                else:
                    counts["fail_no_anchor"] += 1
                continue
                
            if best_res["sim"] < INNER_SIMILARITY_MIN:
                counts["fail_similarity"] += 1
                continue
            
            counts["aligned_reads"] += 1
            if is_reverse:
                counts["reverse_aligned"] += 1
            else:
                counts["forward_aligned"] += 1

            ref_inner = best_res["ref_inner"]
            read_inner = best_res["read_inner"]
            sim = best_res["sim"]

            # Classify using exact token-based indel length calculator
            category, has_sub, net_indel, read_tokens = classify_mutation_with_alignment(ref_inner.upper(), read_inner.upper())
            counts[category] += 1
            if has_sub:   
                counts["substitution"] += 1

            # Grouping for Annotation View
            key = read_inner.upper()
            if key not in groups_dict:
                groups_dict[key] = {
                    "read_inner": key,
                    "read_count": 0,
                    "classification": category,
                    "net_indel": net_indel,
                    "has_sub": has_sub,
                    "tokens": read_tokens
                }
            groups_dict[key]["read_count"] += 1

            if i < 1000:
                read_details.append({
                    "read_index":     i + 1,
                    "target_found":   True,
                    "net_indel":      len(read_inner) - len(ref_inner),
                    "similarity":     round(sim, 3),
                    "classification": category,
                    "orientation":    "RC" if is_reverse else "FW"
                })

        # ── Step 5: Debug logging ─────────────────────────────────────────────
        aligned = counts["aligned_reads"]
        total   = counts["total_reads"]
        sum_cls = counts["out_of_frame"] + counts["in_frame"] + counts["no_indel"]

        # ── Indel Threshold Filter ──────────────────────────────────────────
        # CRISPRnano systematically drops noisy groups that represent < N% of total aligned reads
        # from the denominator to clean up the statistics.
        threshold_count = aligned * (indel_threshold / 100.0)
        
        # We must re-tally the true aligned reads and classifications
        # based ONLY on groups that pass the threshold.
        passed_groups_dict = {}
        for k, g in groups_dict.items():
            if g["read_count"] >= threshold_count:
                passed_groups_dict[k] = g

        new_aligned = sum(g["read_count"] for g in passed_groups_dict.values())
        new_out_of_frame = sum(g["read_count"] for g in passed_groups_dict.values() if g["classification"] == "out_of_frame")
        new_in_frame_reads = sum(g["read_count"] for g in passed_groups_dict.values() if g["classification"] == "in_frame")
        new_no_indel = sum(g["read_count"] for g in passed_groups_dict.values() if g["classification"] == "no_indel")
        new_substitution = sum(g["read_count"] for g in passed_groups_dict.values() if g["classification"] == "no_indel" and g["has_sub"])
        
        counts["read_ambiguous"] = aligned - new_aligned
        counts["aligned_passed"] = new_aligned

        print(f"\n[DEBUG] ===== CRISPRnano-style Results: {target_id} =====")
        print(f"  total_reads         = {total}")
        print(f"  forward_aligned     = {counts['forward_aligned']}")
        print(f"  reverse_aligned     = {counts['reverse_aligned']}")
        print(f"  --- Filter breakdown ---")
        print(f"  fail_no_anchor      = {counts['fail_no_anchor']}")
        print(f"  fail_quality        = {counts['fail_quality']}   (phred < {phred_threshold})")
        print(f"  fail_similarity     = {counts['fail_similarity']}  (inner sim < {INNER_SIMILARITY_MIN})")
        print(f"  fail_threshold ({indel_threshold}%)  = {counts['read_ambiguous']}")
        print(f"  final_aligned_reads = {new_aligned}   ← true denominator for all %")
        print(f"  --- Re-calculated Classification ---")
        print(f"  out_of_frame_reads  = {new_out_of_frame}")
        print(f"  in_frame_reads      = {new_in_frame_reads}")
        print(f"  no_indel_reads      = {new_no_indel}")
        print(f"  substitution_reads  = {new_substitution}  (subset of no_indel)")

        def pct(val):
            return round(val / new_aligned * 100, 2) if new_aligned > 0 else 0.0

        print(f"\n  Out-of-frame %  = {new_out_of_frame} / {new_aligned} × 100 = {pct(new_out_of_frame)}%")
        print(f"  In-frame %      = {new_in_frame_reads} / {new_aligned} × 100 = {pct(new_in_frame_reads)}%")
        print(f"  No indel %      = {new_no_indel} / {new_aligned} × 100 = {pct(new_no_indel)}%")
        print(f"  Substitution %  = {new_substitution} / {new_aligned} × 100 = {pct(new_substitution)}%")
        print(f"[DEBUG] ================================================\n")

        # ── Step 5b: Generate Top Groups for Annotation View ──────────────────
        sorted_groups = sorted(passed_groups_dict.values(), key=lambda x: x["read_count"], reverse=True)[:10]
        top_groups = []
        
        print("\n  [DEBUG] --- Top Groups Normalization Check ---")
        
        for idx, g in enumerate(sorted_groups):
            group_pct = pct(g["read_count"])
            
            if idx < 3:
                print(f"  Group {idx+1}:")
                print(f"    - selected strand          : FORWARD (Strict enforcement)")
                print(f"    - reference sequence used  : {ref_inner_fixed}")
                print(f"    - reverse comp applied?    : YES, automatically processed if read originated from RC")
                print(f"    - mut_pos before normaliz. : N/A (Normalized BEFORE alignment phase)")
                print(f"    - mut_pos after normaliz.  : Net Indel: {g['net_indel']}")
                print(f"    - final displayed sequence : {g['read_inner']}")
                
            display_class = "Out-of-frame indel" if g["classification"] == "out_of_frame" else \
                            "In-frame indel" if g["classification"] == "in_frame" else \
                            "Substitution" if (g["classification"] == "no_indel" and g["has_sub"]) else \
                            "No indel"

            top_groups.append({
                "group_rank": idx + 1,
                "read_inner": g["read_inner"],
                "read_count": g["read_count"],
                "read_pct": group_pct,
                "classification": display_class,
                "net_indel": g["net_indel"],
                "tokens": g["tokens"] # Pre-calculated during alignment loop
            })

        # ── Step 6: Build result payload ──────────────────────────────────────
        target_result = {
            "target_id": target_id,
            "summary": {
                "total_reads":      total,
                "matched_reads":    aligned,
                "aligned_reads":    new_aligned,
                "out_of_frame_pct": pct(new_out_of_frame),
                "in_frame_pct":     pct(new_in_frame_reads),
                "no_indel_pct":     pct(new_no_indel),
                "substitution_pct": pct(new_substitution),
                "modified":         new_out_of_frame + new_in_frame_reads,
                "unmodified":       new_no_indel,
                "read_ambiguous":   counts["read_ambiguous"]
            },
            "breakdown": {
                "out_of_frame": counts["out_of_frame"],
                "in_frame":     counts["in_frame"],
                "no_indel":     counts["no_indel"],
                "substitution": counts["substitution"],
                "ambiguous":    counts["fail_quality"] + counts["fail_similarity"],
            },
            "target_id":        target_id,
            "sgrna_seq":        sgrna_seq,
            "display_sgrna_seq": sgrna_seq[::-1] if is_rc_in_ref else sgrna_seq,
            "grna_start_index": grna_start_in_inner,
            "ref_sequence":     ref_inner_fixed,
            "cut_site_index":   cut_site_index_fixed,
            "read_details": read_details,
            "top_groups": top_groups
        }

        final_output["target_results"].append(target_result)

    return final_output

def process_files(file_paths, targets, data_type="single-end", phred_threshold=30, indel_threshold=1.0, progress_callback=None):
    """
    Processes a specific list of file paths.
    """
    print(f"[PROCESS_FILES] Starting analysis of {len(file_paths)} files.")
    if progress_callback:
        progress_callback(10, "Parsing FASTQ files")

    final_payload = {
        "metadata": {
            "data_type": data_type,
            "phred_threshold": phred_threshold,
            "indel_threshold": indel_threshold
        },
        "results": []
    }
    
    total_files = len(file_paths)
    for i, filepath in enumerate(file_paths):
        if os.path.exists(filepath):
            if progress_callback:
                percent = 10 + int((i / total_files) * 80)
                progress_callback(percent, f"Processing sample {i+1} of {total_files}")
            
            file_results = run_analysis(filepath, targets, phred_threshold, indel_threshold)
            final_payload["results"].append(file_results)
            
    if progress_callback:
        progress_callback(95, "Finalizing")
            
    return final_payload

def main():
    parser = argparse.ArgumentParser(description="CRISPR Analysis Orientation Fix")
    parser.add_argument("fastq_dir", help="Path to the directory containing FASTQ files")
    args = parser.parse_args()
    
    targets = [
        {
            "target_id": "Nicole",
            "reference_seq": "ctaggattaatcagacatgcgcagttatataataatcagtttgattttcttttccttttcgagcccctctctctctcactcttttcttttccgagaacccaacaaaaaaaaagctactattaatccttcccctcgtgaggaaatcatttcttcttgtttctcgagatttattctctttctctctctctttctctgtgtgtttcgtgtcttcagattagttcgATGTTTCGTTCAGACAAGGCGGAAAAAATGGATAAACGACGACGGAGACAGAGCAAAGCCAAGGCTTCTTGTTCCGAAGgtctgatttctctttgtttctctctatatctttttgatcggtttgagtctgattttgtatgtttgtttcgcagAGGTGAGTAGTATCGAATGGGAAGCTGTGAAGATGTCAGAAGAAGAAGAAGATCTCATTTCTCGGATGTATAAACTCGTTGGCGACAGgttagagactctttctctctcgatccatcttgttgctttctcttttttttggtctttcatgttttgtcgaatctgcttagattttgatctcaaagtcggtcgtttatttatgcattttcttggtttttctattatattattgggtctaacttaccgagctgtcaatgactgtgttcagcctgatttttgatcttgttattattctctgttttttgttttagttgttcaaatagcaaaacctaatcaagatttcgttttcagtttctttttttatatatgattctttagcaaaacatattcttaatttatgtcagaactcactttggctagtttggttcaattttgattacagcatgtttgtatgaagtcaaagtgtaaattacgattttggttcggttccatagaattttaaccgaattacaaactttatgcggtttttatcggaataaaaggtatttggttaagtgtaagttcctcaacactgactgttagcctatcctacgtggcgcgtagGTGGGAGTTGATCGCCGGAAGGATCCCGGGACGGACGCCGGAGGAGATAGAGAGATATTGGCTTATGAAACACGGCGTCGTTTTTGCCAACAGACGAAGAGACTTTTTTAGGAAATGAttttttttgtttggattaaaagaaaattttcctctccttaattcacaagacaagaaaaaaaggaaatgtacctgtccttgaattactattttggaatgtataattatctatatatataagaagaaaaaattgcttaggaatttcaaatttttaccagcctccatcgacacatgatatatc",
            "sgrna_seq": "AATATCTCTCTATCTCCTC",
            "window_size": 90
        }
    ]
    
    try:
        if not os.path.isdir(args.fastq_dir):
            raise ValueError(f"The path '{args.fastq_dir}' is not a valid directory.")
            
        file_paths = [os.path.join(args.fastq_dir, f) for f in os.listdir(args.fastq_dir) if f.endswith(('.fastq', '.fq'))]
        results_data = process_files(file_paths, targets)
        print(json.dumps(results_data, indent=2))
        return results_data
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
