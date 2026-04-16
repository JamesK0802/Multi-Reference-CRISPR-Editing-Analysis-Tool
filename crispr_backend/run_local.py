import argparse
import sys
import json
import os
from core.parser import parse_fastq
from core.aligner import process_read, extract_window, calculate_cut_site, find_target_in_reference, reverse_complement
from core.analyzer import compare_windows, classify_mutation

def run_analysis(fastq_file, targets):
    """
    Main analysis pipeline. Parses FASTQ once and runs analysis against multiple targets.
    Handles orientation detection for reference and reads.
    """
    print(f"  [RUN_ANALYSIS] Parsing {fastq_file}...")
    sequences = parse_fastq(fastq_file)
    print(f"  [RUN_ANALYSIS] Found {len(sequences)} sequences.")
    
    final_output = {
        "fastq_file": fastq_file,
        "target_results": []
    }
    
    for target in targets:
        target_id = target.get("target_id")
        reference_seq = target.get("reference_seq")
        sgrna_seq = target.get("sgrna_seq")
        window_size = target.get("window_size", 20)
        
        if not reference_seq:
            continue

        # Step 1: Detect gRNA orientation in Reference
        # returns (start_index, is_rc)
        ref_sgrna_start, is_rc_in_ref = find_target_in_reference(reference_seq, sgrna_seq)
        
        if ref_sgrna_start == -1:
            print(f"  [WARNING] Target {target_id} (gRNA: {sgrna_seq}) not found in reference seq!")
            continue

        print(f"  [DEBUG] Target '{target_id}' found at idx {ref_sgrna_start} (RC: {is_rc_in_ref})")

        # Step 2: Pre-calculate reference window
        # calculate_cut_site handles the orientation logic
        ref_cut_site = calculate_cut_site(ref_sgrna_start, sgrna_seq, is_rc=is_rc_in_ref)
        ref_window = extract_window(reference_seq, ref_cut_site, window_size)
        
        # If the target is RC in ref, our reference window is "looking" at an RC gRNA.
        # To make it comparable with reads (which we normalize to forward gRNA in process_read),
        # we must normalize this ref_window to forward orientation too.
        if is_rc_in_ref:
            ref_window = reverse_complement(ref_window)
            print(f"  [DEBUG] Reference window normalized for RC target.")

        # Statistics counters
        counts = {
            "total_reads": len(sequences),
            "matched_reads": 0,
            "wildtype": 0,
            "substitution": 0,
            "insertion": 0,
            "deletion": 0,
            "mixed": 0
        }

        read_details = []

        # Process each read
        for i, seq in enumerate(sequences):
            # process_read handles bi-directional search and normalization
            cut_site, read_window = process_read(seq, sgrna_seq, window_size)
            
            detail = {
                "read_index": i + 1,
                "target_found": False,
                "classification": None
            }
            
            if cut_site is not None:
                detail["target_found"] = True
                counts["matched_reads"] += 1
                
                # Now both windows are normalized to the same orientation
                classification = classify_mutation(ref_window, read_window)
                detail["classification"] = classification
                
                if classification in counts:
                    counts[classification] += 1
                    
            if i < 1000: # Limit detail for large files to keep JSON manageable
                read_details.append(detail)
            
        # Matched reads is our denominator for percentages (except efficiency)
        aligned = counts["matched_reads"]
        total = counts["total_reads"]
        indels = counts["insertion"] + counts["deletion"] + counts["mixed"]
        modified = aligned - counts["wildtype"]

        # Calculate percentages
        def percent(val, den): return round((val / den * 100), 2) if den > 0 else 0.0

        target_result = {
            "target_id": target_id,
            "summary": {
                "total_reads": total,
                "matched_reads": aligned,
                "aligned_reads": aligned,
                "unmodified": counts["wildtype"],
                "modified": modified,
                "indel_freq": percent(indels, aligned),
                "indel_percent": percent(indels, aligned),
                "sub_freq": percent(counts["substitution"], aligned),
                "sub_percent": percent(counts["substitution"], aligned),
                "insertion_percent": percent(counts["insertion"], aligned),
                "deletion_percent": percent(counts["deletion"], aligned),
                "mixed_percent": percent(counts["mixed"], aligned),
                "editing_efficiency": percent(modified, total)
            },
            "breakdown": {
                "wildtype": counts["wildtype"],
                "substitution": counts["substitution"],
                "insertion": counts["insertion"],
                "deletion": counts["deletion"],
                "mixed": counts["mixed"]
            },
            "read_details": read_details
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
            
            file_results = run_analysis(filepath, targets)
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
