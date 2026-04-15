import argparse
import sys
import json
import os
from core.parser import parse_fastq
from core.aligner import process_read, extract_window, calculate_cut_site
from core.analyzer import compare_windows, classify_mutation

def run_analysis(fastq_file, targets):
    """
    Main analysis pipeline. Parses FASTQ once and runs analysis against multiple targets.
    Ready to be imported directly into a future FastAPI endpoint!
    """
    sequences = parse_fastq(fastq_file)
    
    final_output = {
        "fastq_file": fastq_file,
        "target_results": []
    }
    
    for target in targets:
        target_id = target.get("target_id")
        reference_seq = target.get("reference_seq")
        sgrna_seq = target.get("sgrna_seq")
        window_size = target.get("window_size", 20)
        
        # Pre-calculate reference window
        ref_sgrna_start = reference_seq.find(sgrna_seq)
        ref_cut_site = calculate_cut_site(ref_sgrna_start, sgrna_seq)
        ref_window = extract_window(reference_seq, ref_cut_site, window_size)
        
        # Statistics counters and detailed read list for this target
        target_result = {
            "target_id": target_id,
            "summary": {
                "total_reads": len(sequences),
                "matched_reads": 0,
                "unmodified": 0,
                "modified": 0,
                "insertion": 0,
                "deletion": 0,
                "substitution": 0,
                "complex_modified": 0
            },
            "read_details": [] # Optional per-read classification
        }

        # Process each read for this specific target
        for i, seq in enumerate(sequences):
            cut_site, read_window = process_read(seq, sgrna_seq, window_size)
            
            detail = {
                "read_index": i + 1,
                "target_found": False,
                "classification": None
            }
            
            if cut_site is not None:
                detail["target_found"] = True
                target_result["summary"]["matched_reads"] += 1
                
                classification = classify_mutation(ref_window, read_window)
                detail["classification"] = classification
                
                if classification == "unmodified":
                    target_result["summary"]["unmodified"] += 1
                else:
                    target_result["summary"]["modified"] += 1
                    target_result["summary"][classification] += 1
                    
            target_result["read_details"].append(detail)
            
        final_output["target_results"].append(target_result)
        
    return final_output

def process_directory(directory_path, targets, data_type="single-end", phred_threshold=30, indel_threshold=1.0):
    """
    Finds all fastq files in a directory and processes them in sequence.
    """
    final_payload = {
        "metadata": {
            "data_type": data_type,
            "phred_threshold": phred_threshold,
            "indel_threshold": indel_threshold
        },
        "results": []
    }
    
    # Iterate over files in the directory
    for filename in sorted(os.listdir(directory_path)):
        if filename.endswith(".fastq") or filename.endswith(".fq"):
            filepath = os.path.join(directory_path, filename)
            # Run analysis identically on each file
            file_results = run_analysis(filepath, targets)
            final_payload["results"].append(file_results)
            
    return final_payload

def main():
    parser = argparse.ArgumentParser(description="CRISPR Analysis MVP")
    parser.add_argument("fastq_dir", help="Path to the directory containing FASTQ files")
    
    args = parser.parse_args()
    
    # Hardcoded list of targeted CRISPR locations
    targets = [
        {
            "target_id": "Target_1_Main",
            "reference_seq": "GATTTGGGGTTCAAAGCAGTATCGATCAAATAGTAAATCCATTTGTTCAACTCACAGTTT",
            "sgrna_seq": "ATCGATCAAATAGTAAATCC",
            "window_size": 20
        },
        {
            "target_id": "Target_2_Secondary",
            "reference_seq": "ATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG",
            "sgrna_seq": "ATCGATCGATCGATCGATCG",
            "window_size": 20
        }
    ]
    
    try:
        if not os.path.isdir(args.fastq_dir):
            raise ValueError(f"The path '{args.fastq_dir}' is not a valid directory.")
            
        results_data = process_directory(args.fastq_dir, targets)
        
        # Print JSON formatting
        json_output = json.dumps(results_data, indent=2)
        print(json_output)
        
        # Also return structurally
        return results_data
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
