"""
multi_reference_assigner.py — Unified Demultiplexing for Multi-Gene Analysis.
Now reuses the core.classifier logic for exact consistency with benchmarking.
"""

import core.classifier as classifier

def assign_reads_to_references(reads_data, gene_payloads, phred_threshold=10, margin_threshold=0.05):
    """
    Unified read assignment using the shared classifier core.
    
    Args:
        reads_data: List of tuples (seq, qual)
        gene_payloads: List of { gene, sequence, targets: [{target_id, sgrna_seq}] }
        phred_threshold: float
        margin_threshold: float
    """
    # 1. Prepare target list for classifier
    # We need a flat list of (gene, target, ref_window) candidates
    classifier_classes = []
    for g in gene_payloads:
        gene_name = g["gene"]
        gene_ref = g["sequence"]
        for t in g.get("targets", []):
            # Derive cut site and window for this (gene, target) pair
            cut_info = classifier.find_grna_cut_site(gene_ref, t["sgrna_seq"])
            # Use 90 as default window if not specified (matches frontend baseline)
            win_size = t.get("window_size", 90)
            ref_win = classifier.extract_window(gene_ref, cut_info["cut_site"], win_size)
            
            classifier_classes.append({
                "gene": gene_name,
                "target": t["target_id"],
                "ref_window": ref_win
            })

    results = {
        "genes": {g["gene"]: [] for g in gene_payloads},
        "ambiguous_reads": []
    }
    
    total_reads = len(reads_data)
    ambiguous_count = 0
    filtered_count = 0
    assigned_counts = {g["gene"]: 0 for g in gene_payloads}
    
    # 2. Iterate and classify
    for i, (seq, qual) in enumerate(reads_data):
        res = classifier.apply_classification(
            seq, qual, 
            classifier_classes, 
            phred_threshold, 
            margin_threshold
        )
        
        read_obj = {
            "read_index": i,
            "seq": seq,
            "qual": qual,
            "best_score": res.get("top1_score", 0.0)
        }
        
        if res["assigned"]:
            results["genes"][res["predicted_gene"]].append(read_obj)
            assigned_counts[res["predicted_gene"]] += 1
        else:
            if res.get("reason") == "filtered":
                filtered_count += 1
            else:
                results["ambiguous_reads"].append(read_obj)
                ambiguous_count += 1
                
    # 3. Format output
    output_genes = []
    for gene_name, reads in results["genes"].items():
        output_genes.append({
            "gene": gene_name,
            "assigned_reads": reads,
            "count": len(reads),
            "average_score": sum(r["best_score"] for r in reads) / len(reads) if reads else 0.0
        })
        
    print(f"[CLASSIFIER_DEMUX] Finished: total={total_reads}, assigned={sum(assigned_counts.values())}, ambiguous={ambiguous_count}, filtered={filtered_count}")
        
    return {
        "genes": output_genes,
        "ambiguous_reads": results["ambiguous_reads"],
        "debug_logs": {
            "total_reads": total_reads,
            "assigned_count": sum(assigned_counts.values()),
            "ambiguous_count": ambiguous_count,
            "filtered_count": filtered_count,
            "per_gene_counts": assigned_counts
        }
    }
