import difflib
import statistics
from core.aligner import reverse_complement

def calculate_alignment_score(read_seq, ref_seq):
    """
    Computes a simple alignment score between a read and a reference
    using SequenceMatcher.
    """
    return difflib.SequenceMatcher(None, read_seq, ref_seq).ratio()

def assign_reads_to_references(reads_data, references, margin_threshold=0.05):
    """
    Assigns each read to the best matching reference.
    
    Args:
        reads_data: List of tuples (seq, qual) from parser.
        references: List of dicts [{"gene": "GeneA", "sequence": "ACTG..."}, ...]
        margin_threshold: float, min difference between top 2 scores to make an assignment.
        
    Returns:
        dict: {
            "genes": [ {"gene": "GeneA", "assigned_reads": [...], "count": ...}, ... ],
            "ambiguous_reads": [...],
            "debug_logs": {...}
        }
    """
    # Pre-calculate RC for references to avoid doing it per read if possible, 
    # but actually we can just RC the read once per loop.
    
    results = {
        "genes": {ref["gene"]: [] for ref in references},
        "ambiguous_reads": []
    }
    
    # Pre-store reference sequences (upper case for consistency)
    refs = []
    for r in references:
        refs.append({
            "gene": r["gene"],
            "seq": r["sequence"].upper()
        })
        
    total_reads = len(reads_data)
    ambiguous_count = 0
    assigned_counts = {r["gene"]: 0 for r in references}
    score_sums = {r["gene"]: 0.0 for r in references} # for avg score
    
    for i, (read_seq, read_qual) in enumerate(reads_data):
        read_seq_upper = read_seq.upper()
        rc_read_seq = reverse_complement(read_seq_upper)
        
        scores = []
        for ref in refs:
            # Score forward strand
            score_fw = calculate_alignment_score(read_seq_upper, ref["seq"])
            # Score reverse complement
            score_rc = calculate_alignment_score(rc_read_seq, ref["seq"])
            
            best_strand_score = max(score_fw, score_rc)
            scores.append((best_strand_score, ref["gene"]))
            
        # Sort by score descending
        scores.sort(key=lambda x: x[0], reverse=True)
        
        best_score, best_gene = scores[0]
        
        # If only 1 reference, second best score is 0
        second_best_score = scores[1][0] if len(scores) > 1 else 0.0
        
        read_obj = {
            "read_index": i,
            "seq": read_seq,
            "qual": read_qual,
            "best_score": best_score,
            "second_best_score": second_best_score
        }
        
        if (best_score - second_best_score) > margin_threshold:
            results["genes"][best_gene].append(read_obj)
            assigned_counts[best_gene] += 1
            score_sums[best_gene] += best_score
        else:
            results["ambiguous_reads"].append(read_obj)
            ambiguous_count += 1
            
    # Format output
    output = {
        "genes": [],
        "ambiguous_reads": results["ambiguous_reads"]
    }
    
    for ref_gene, reads in results["genes"].items():
        avg_score = (score_sums[ref_gene] / assigned_counts[ref_gene]) if assigned_counts[ref_gene] > 0 else 0.0
        output["genes"].append({
            "gene": ref_gene,
            "assigned_reads": reads,
            "count": assigned_counts[ref_gene],
            "average_score": avg_score
        })
        
    # Debug logs
    debug_logs = {
        "total_reads": total_reads,
        "ambiguous_count": ambiguous_count,
        "per_gene_counts": assigned_counts,
        "average_scores": { 
            g["gene"]: g["average_score"] for g in output["genes"] 
        }
    }
    
    output["debug_logs"] = debug_logs
    
    print(f"[DEBUG] Multi-Reference Assignment Finished:")
    print(f"  Total reads: {total_reads}")
    for gene_data in output["genes"]:
        print(f"  Gene '{gene_data['gene']}' assigned count: {gene_data['count']} (Avg Score: {gene_data['average_score']:.3f})")
    print(f"  Ambiguous reads count: {ambiguous_count}")
    
    return output
