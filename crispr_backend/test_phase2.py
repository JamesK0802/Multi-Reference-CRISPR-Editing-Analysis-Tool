import os
import json
from core.multi_reference_assigner import assign_reads_to_references
from run_local import run_multi_reference_analysis

def test_phase2():
    # Setup dummy FASTQ
    dummy_fastq = "test_phase2.fastq"
    with open(dummy_fastq, "w") as f:
        # 1 read for GeneA matching completely
        f.write("@Read1\nATGCGTACGTTAGCTAGCTAGCTGATCGATGCTAGCTAGCTA\n+\n" + "I"*42 + "\n")
        # 1 read for GeneB
        f.write("@Read2\nCCGGATATCGATCGATCGACTAGCTAGCTAGCTACGATCGA\n+\n" + "I"*41 + "\n")
        # 1 ambiguous read
        f.write("@Read3\nATGCGTACGTTAGCGGATATCGATCGATCGACTAGCTAGCTA\n+\n" + "I"*42 + "\n")
        
    genes_payload = [
        {
            "gene": "GeneA",
            "sequence": "ATGCGTACGTTAGCTAGCTAGCTGATCGATGCTAGCTAGCTA",
            "targets": [
                {
                    "target_id": "Target1_A",
                    "sgrna_seq": "GCTGATCGATG",
                    "window_size": 30
                }
            ]
        },
        {
            "gene": "GeneB",
            "sequence": "CCGGATATCGATCGATCGACTAGCTAGCTAGCTACGATCGA",
            "targets": [
                {
                    "target_id": "Target1_B",
                    "sgrna_seq": "CGATCGATCGA",
                    "window_size": 30
                }
            ]
        }
    ]

    print("Testing multi-reference pipeline...")
    result = run_multi_reference_analysis(
        dummy_fastq, 
        genes_payload, 
        assignment_margin_threshold=0.1, 
        phred_threshold=10, 
        indel_threshold=1.0
    )
    
    print("\n\n--- SAMPLE OUTPUT STRUCTURE ---")
    print(json.dumps(result, indent=2))
    
    if os.path.exists(dummy_fastq):
        os.remove(dummy_fastq)

if __name__ == "__main__":
    test_phase2()
