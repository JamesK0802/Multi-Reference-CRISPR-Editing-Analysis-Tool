import argparse
import sys
import json
import os
import statistics
import difflib
from core.parser import parse_fastq
from core.aligner import (process_read_with_anchors, extract_window,
                           calculate_cut_site, find_target_in_reference,
                           reverse_complement)
from core.analyzer import classify_mutation_with_alignment
from core.multi_reference_assigner import assign_reads_to_references
import core.classifier as classifier


def run_analysis(fastq_file, targets, phred_threshold=10, indel_threshold=1.0):
    print(f"  [RUN_ANALYSIS] Parsing {fastq_file}...")
    data = parse_fastq(fastq_file)
    print(f"  [RUN_ANALYSIS] Found {len(data)} sequences.")

    final_output = {
        "fastq_file": fastq_file,
        "target_results": run_analysis_on_reads(data, targets, phred_threshold, indel_threshold)
    }
    return final_output

def run_analysis_on_reads(data, targets, phred_threshold=10, indel_threshold=1.0):
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

    total_reads = len(data)
    target_results_list = []

    print(f"  [RUN_ANALYSIS_ON_READS] Starting analysis for {len(targets)} targets on {len(data)} reads.")
    for target in targets:
        target_id     = target.get("target_id")
        reference_seq = target.get("reference_seq")
        sgrna_seq     = target.get("sgrna_seq")
        window_size   = target.get("window_size", 90)

        if not reference_seq:
            print(f"  [WARNING] Target {target_id} has no reference sequence, skipping.")
            continue

        # ── Step 1: Locate gRNA in reference ──────────────────────────────────
        ref_sgrna_start, is_rc_in_ref = find_target_in_reference(reference_seq, sgrna_seq)

        if ref_sgrna_start == -1:
            print(f"  [CRITICAL WARNING] Target '{target_id}' gRNA '{sgrna_seq}' NOT FOUND in reference (len={len(reference_seq)})!")
            target_results_list.append({
                "target_id": target_id,
                "error": "gRNA not found in reference",
                "summary": {"total_reads": len(data), "matched_reads": 0, "aligned_reads": 0}
            })
            continue

        print(f"  [DEBUG] Processing Target '{target_id}' at idx {ref_sgrna_start} (RC={is_rc_in_ref})")

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
        # USE UNIFIED CLASSIFIER CORE
        import core.classifier as classifier
        for i, (seq, qual) in enumerate(data):
            usable, reason, best_res = classifier.is_read_usable(seq, qual, ref_window, phred_threshold)

            if not usable:
                if reason == "quality": 
                    counts["fail_quality"] += 1
                else: 
                    counts[f"fail_{reason}"] += 1
                continue
                
            counts["aligned_reads"] += 1
            if best_res["is_rc"]:
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
                    "orientation":    "RC" if best_res["is_rc"] else "FW"
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
                "out_of_frame": new_out_of_frame,
                "in_frame":     new_in_frame_reads,
                "no_indel":     new_no_indel - new_substitution, # Pure no-indel (unmodified)
                "substitution": new_substitution,
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

        target_results_list.append(target_result)

    return target_results_list

def run_demultiplex(fastq_file, references, margin_threshold=0.05):
    """
    Phase 1: Multi-reference read assignment (demultiplexing).
    Assigns each read to the most likely reference gene based on alignment scores.
    """
    print(f"  [RUN_DEMULTIPLEX] Parsing {fastq_file}...")
    data = parse_fastq(fastq_file)
    print(f"  [RUN_DEMULTIPLEX] Found {len(data)} sequences.")

    result = assign_reads_to_references(data, references, margin_threshold)

    return {
        "fastq_file": fastq_file,
        "demultiplex_result": result
    }

def run_multi_reference_analysis(fastq_file, genes_payload, assignment_margin_threshold=0.05, phred_threshold=10, indel_threshold=1.0, analyze_ambiguous=False):
    """
    Phase 2: Multi-reference assignment + per-gene CRISPR analysis.
    
    genes_payload format:
    [
        {
            "gene": "GeneA",
            "sequence": "ACTG...", # Full reference for demultiplexing
            "targets": [
                {
                    "target_id": "Target1",
                    "sgrna_seq": "...",
                    "window_size": 90,
                    # reference_seq is auto-filled from the gene's sequence
                }
            ]
        }, ...
    ]
    """
    print(f"  [MULTI_REF_ANALYSIS] Parsing {fastq_file}...")
    data = parse_fastq(fastq_file)
    total_reads_initial = len(data)
    print(f"  [MULTI_REF_ANALYSIS] Total reads: {total_reads_initial}")
    
    demux_references = [
        {
            "gene": g["gene"],
            "sequence": g["sequence"]
        } for g in genes_payload
    ]
    
    print(f"  [MULTI_REF_ANALYSIS] Demultiplexing with margin={assignment_margin_threshold}...")
    demux_result = assign_reads_to_references(data, demux_references, assignment_margin_threshold)
    
    ambiguous_reads_count = len(demux_result["ambiguous_reads"])
    print(f"  [MULTI_REF_ANALYSIS] Ambiguous reads: {ambiguous_reads_count}")
    
    output = {
        "genes": [],
        "ambiguous_read_count": ambiguous_reads_count,
        "debug": {
            "total_reads_parsed": total_reads_initial,
            "phred_passed_count": demux_result.get("debug_logs", {}).get("phred_passed_count", 0),
            "anchor_matched_count": demux_result.get("debug_logs", {}).get("anchor_matched_count", 0),
            "assignment_margin_threshold_used": assignment_margin_threshold,
            "genes": []
        }
    }
    print(f"DEBUG: total_initial={total_reads_initial}, usable={output['debug']['usable_count']}")
    
    # Run analysis for each gene bucket
    for gene_bucket in demux_result["genes"]:
        gene_name = gene_bucket["gene"]
        assigned_reads_info = gene_bucket["assigned_reads"]
        
        # Find corresponding gene payload to get targets
        gene_payload = next((g for g in genes_payload if g["gene"] == gene_name), None)
        if not gene_payload:
            continue
            
        targets = gene_payload.get("targets", [])
        
        # Auto-fill reference_seq for targets if missing, using the gene's sequence
        for t in targets:
            if "reference_seq" not in t or not t["reference_seq"]:
                t["reference_seq"] = gene_payload["sequence"]
                
        # Reconstruct exactly the (seq, qual) tuples for analysis
        # assigned_reads_info contains {"seq": ..., "qual": ...}
        gene_reads_data = [(r["seq"], r["qual"]) for r in assigned_reads_info]
        assigned_count = len(gene_reads_data)
        
        print(f"  [MULTI_REF_ANALYSIS] Gene '{gene_name}' -> assigned: {assigned_count}, analyzing targets: [ {', '.join([t.get('target_id','') for t in targets])} ]")
        
        analysis_result_targets = run_analysis_on_reads(gene_reads_data, targets, phred_threshold, indel_threshold)
        
        output["genes"].append({
            "gene": gene_name,
            "assigned_read_count": assigned_count,
            "ambiguous_excluded": True,
            "analysis_result": {
                "targets": analysis_result_targets
            }
        })
        
        output["debug"]["genes"].append({
            "gene": gene_name,
            "reference_length": len(gene_payload["sequence"]),
            "assigned_reads_analyzed": assigned_count,
            "number_of_targets_analyzed": len(targets)
        })

    # ── OPTIONAL: Analyze Ambiguous Reads separately for each class ──────────
    if analyze_ambiguous and demux_result["ambiguous_reads"]:
        print(f"  [MULTI_REF_ANALYSIS] Starting optional ambiguous-read analysis for each gene...")
        ambiguous_reads_data = [(r["seq"], r["qual"]) for r in demux_result["ambiguous_reads"]]
        
        for gene_payload in genes_payload:
            gene_name = gene_payload["gene"]
            targets = gene_payload.get("targets", [])
            
            # Re-use existing analysis pipeline on the ambiguous pool
            # Results are isolated from regular classification
            amb_analysis_targets = run_analysis_on_reads(ambiguous_reads_data, targets, phred_threshold, indel_threshold)
            
            output["genes"].append({
                "gene": f"{gene_name}-ambiguous",
                "assigned_read_count": len(ambiguous_reads_data),
                "ambiguous_excluded": False, # This tab IS the ambiguous pool
                "is_ambiguous_derived": True,
                "analysis_result": {
                    "targets": amb_analysis_targets
                }
            })
            
    print(f"  [MULTI_REF_ANALYSIS] Returning multi-reference results grouped by gene.")
    return output

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

def process_files_multi(file_paths, genes_payload, data_type="single-end", phred_threshold=30, indel_threshold=1.0, margin_threshold=0.05, progress_callback=None, analyze_ambiguous=False, rescue_ambiguous=False):
    """
    Processes file paths for multi-reference analysis with fine-grained progress.
    Emits file / demux / gene / target level progress events.
    """
    print(f"[PROCESS_FILES_MULTI] Starting multi-reference analysis of {len(file_paths)} files.")

    total_files = len(file_paths)
    total_genes = len(genes_payload)

    if progress_callback:
        progress_callback(5, f"Starting - {total_files} file(s), {total_genes} gene(s)")

    final_payload = {
        "metadata": {
            "data_type": data_type,
            "phred_threshold": phred_threshold,
            "indel_threshold": indel_threshold,
            "margin_threshold": margin_threshold,
            "is_multi_reference": True
        },
        "results": []
    }

    # 10-95 range spread across all files
    file_range = 85.0 / max(total_files, 1)

    for fi, filepath in enumerate(file_paths):
        if not os.path.exists(filepath):
            continue

        file_base = 10.0 + fi * file_range
        file_name = os.path.basename(filepath)

        if progress_callback:
            progress_callback(int(file_base),
                              f"Parsing {file_name} (file {fi+1}/{total_files})")

        # Parse FASTQ
        from core.parser import parse_fastq
        data = parse_fastq(filepath)
        total_reads = len(data)

        if progress_callback:
            progress_callback(int(file_base + file_range * 0.10),
                              f"Assigning {total_reads:,} reads to {total_genes} genes (file {fi+1}/{total_files})")

        # Demultiplex using Unified Classifier Core
        from core.multi_reference_assigner import assign_reads_to_references
        import core.classifier as classifier
        demux_result = assign_reads_to_references(
            data, 
            genes_payload, 
            phred_threshold=phred_threshold, 
            margin_threshold=margin_threshold
        )
        ambiguous_count = len(demux_result["ambiguous_reads"])

        if progress_callback:
            progress_callback(int(file_base + file_range * 0.20),
                              f"Demux complete - {ambiguous_count:,} ambiguous (file {fi+1}/{total_files})")

        # Per-gene analysis
        gene_range = file_range * 0.70 / max(total_genes, 1)
        gene_output = {
            "genes": [],
            "ambiguous_read_count": ambiguous_count,
            "debug": {
                "total_reads_parsed": total_reads,
                "phred_passed_count": demux_result.get("debug_logs", {}).get("phred_passed_count", 0),
                "anchor_matched_count": demux_result.get("debug_logs", {}).get("anchor_matched_count", 0),
                "assignment_margin_threshold_used": margin_threshold,
                "genes": []
            }
        }

        for gi, gene_bucket in enumerate(demux_result["genes"]):
            gene_name  = gene_bucket["gene"]
            gene_reads = [(r["seq"], r["qual"]) for r in gene_bucket["assigned_reads"]]
            gene_payload = next((g for g in genes_payload if g["gene"] == gene_name), None)
            if not gene_payload:
                continue

            targets_for_gene = gene_payload.get("targets", [])
            total_targets    = len(targets_for_gene)
            gene_pct_base    = file_base + file_range * 0.20 + gi * gene_range

            if progress_callback:
                progress_callback(int(gene_pct_base),
                                  f"Gene {gi+1}/{total_genes}: {gene_name} - {len(gene_reads):,} reads (file {fi+1}/{total_files})")

            for t in targets_for_gene:
                if not t.get("reference_seq"):
                    t["reference_seq"] = gene_payload["sequence"]

            target_results = run_analysis_on_reads(gene_reads, targets_for_gene, phred_threshold, indel_threshold)

            gene_output["genes"].append({
                "gene": gene_name,
                "assigned_read_count": len(gene_reads),
                "ambiguous_excluded": True,
                "analysis_result": {"targets": target_results}
            })
            gene_output["debug"]["genes"].append({
                "gene": gene_name,
                "reference_length": len(gene_payload["sequence"]),
                "assigned_reads_analyzed": len(gene_reads),
                "number_of_targets_analyzed": total_targets
            })

        # ── Step 5c: OPTIONAL: Analyze Ambiguous Reads separately for each class ──
        if analyze_ambiguous and demux_result["ambiguous_reads"]:
            print(f"  [PROCESS_FILES_MULTI] Optional ambiguous-read analysis enabled...")
            amb_reads_data = [(r["seq"], r["qual"]) for r in demux_result["ambiguous_reads"]]
            
            if rescue_ambiguous:
                print(f"  [PROCESS_FILES_MULTI] Running robust k-mer rescue clustering...")
                
                def get_kmers(s, k=10):
                    return set(s[i:i+k] for i in range(len(s)-k+1)) if len(s) >= k else set()
                
                clusters = [] # list of (kmers, representative_seq, rep_qual, [reads])
                for r in amb_reads_data:
                    seq = r[0]
                    qual = r[1]
                    kmers = get_kmers(seq)
                    if not kmers:
                        continue
                    found = False
                    for c in clusters:
                        rep_kmers = c[0]
                        intersection = len(kmers & rep_kmers)
                        sim = intersection / max(len(kmers), 1)
                        if sim >= 0.65: # ~65% k-mer overlap roughly corresponds to 85% sequence identity
                            c[3].append(r)
                            found = True
                            break
                    if not found:
                        clusters.append((kmers, seq, qual, [r]))
                
                rescued_by_class = {g["gene"]: [] for g in genes_payload}
                unresolved_reads = []
                
                classifier_classes = []
                for g in genes_payload:
                    for t in g.get("targets", []):
                        cut_info = classifier.find_grna_cut_site(g["sequence"], t["sgrna_seq"])
                        win_size = t.get("window_size", 90)
                        ref_win = classifier.extract_window(g["sequence"], cut_info["cut_site"], win_size)
                        classifier_classes.append({
                            "gene": g["gene"],
                            "target": t.get("target_id", ""),
                            "ref_window": ref_win
                        })
                
                for c in clusters:
                    cluster_reads = c[3]
                    if len(cluster_reads) < 20:
                        unresolved_reads.extend(cluster_reads)
                        continue
                        
                    representative = c[1]
                    rep_qual = c[2]
                    
                    best_score = -1.0
                    best_class = None
                    
                    for c in classifier_classes:
                        usable, _, _ = classifier.is_read_usable(representative, rep_qual, c["ref_window"], phred_threshold)
                        if usable:
                            score = classifier.score_read_against_window(representative, c["ref_window"])
                            if score > best_score:
                                best_score = score
                                best_class = c["gene"]
                    
                    if best_class is None:
                        unresolved_reads.extend(cluster_reads)
                    else:
                        rescued_by_class[best_class].extend(cluster_reads)
                        
                print(f"  [PROCESS_FILES_MULTI] Rescued clusters formed: {sum(len(v) for v in rescued_by_class.values())} reads rescued. Unresolved: {len(unresolved_reads)}")
                
                for gene_payload in genes_payload:
                    g_name = gene_payload["gene"]
                    rescued_reads = rescued_by_class[g_name]
                    if rescued_reads:
                        g_targets = gene_payload.get("targets", [])
                        for t in g_targets:
                            if not t.get("reference_seq"):
                                t["reference_seq"] = gene_payload["sequence"]
                                
                        rescued_results = run_analysis_on_reads(rescued_reads, g_targets, phred_threshold, indel_threshold)
                        
                        gene_output["genes"].append({
                            "gene": f"{g_name}-rescued",
                            "assigned_read_count": len(rescued_reads),
                            "ambiguous_excluded": False,
                            "is_rescued_derived": True,
                            "analysis_result": {"targets": rescued_results}
                        })
                
                amb_reads_to_analyze = unresolved_reads
            else:
                amb_reads_to_analyze = amb_reads_data
            
            if amb_reads_to_analyze:
                for gene_payload in genes_payload:
                    g_name = gene_payload["gene"]
                    g_targets = gene_payload.get("targets", [])
                    for t in g_targets:
                        if not t.get("reference_seq"):
                            t["reference_seq"] = gene_payload["sequence"]

                    amb_results = run_analysis_on_reads(amb_reads_to_analyze, g_targets, phred_threshold, indel_threshold)
                    
                    gene_output["genes"].append({
                        "gene": f"{g_name}-ambiguous",
                        "assigned_read_count": len(amb_reads_to_analyze),
                        "ambiguous_excluded": False,
                        "is_ambiguous_derived": True,
                        "analysis_result": {"targets": amb_results}
                    })

        final_payload["results"].append({
            "fastq_file": filepath,
            "multi_reference_result": gene_output
        })

    if progress_callback:
        progress_callback(95, "Building results...")

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
