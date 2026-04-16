import os
import sys
import json

# Add core to path
sys.path.append('core')

from core.parser import parse_fastq
from core.aligner import process_read, find_target_in_reference, reverse_complement, extract_window, calculate_cut_site
from core.analyzer import classify_mutation

def verify_fixed_logic():
    fastq_path = 'data/barcode60.fq'
    sgrna = 'AATATCTCTCTATCTCCTC'
    reference = 'ctaggattaatcagacatgcgcagttatataataatcagtttgattttcttttccttttcgagcccctctctctctcactcttttcttttccgagaacccaacaaaaaaaaagctactattaatccttcccctcgtgaggaaatcatttcttcttgtttctcgagatttattctctttctctctctctttctctgtgtgtttcgtgtcttcagattagttcgATGTTTCGTTCAGACAAGGCGGAAAAAATGGATAAACGACGACGGAGACAGAGCAAAGCCAAGGCTTCTTGTTCCGAAGgtctgatttctctttgtttctctctatatctttttgatcggtttgagtctgattttgtatgtttgtttcgcagAGGTGAGTAGTATCGAATGGGAAGCTGTGAAGATGTCAGAAGAAGAAGAAGATCTCATTTCTCGGATGTATAAACTCGTTGGCGACAGgttagagactctttctctctcgatccatcttgttgctttctcttttttttggtctttcatgttttgtcgaatctgcttagattttgatctcaaagtcggtcgtttatttatgcattttcttggtttttctattatattattgggtctaacttaccgagctgtcaatgactgtgttcagcctgatttttgatcttgttattattctctgttttttgttttagttgttcaaatagcaaaacctaatcaagatttcgttttcagtttctttttttatatatgattctttagcaaaacatattcttaatttatgtcagaactcactttggctagtttggttcaattttgattacagcatgtttgtatgaagtcaaagtgtaaattacgattttggttcggttccatagaattttaaccgaattacaaactttatgcggtttttatcggaataaaaggtatttggttaagtgtaagttcctcaacactgactgttagcctatcctacgtggcgcgtagGTGGGAGTTGATCGCCGGAAGGATCCCGGGACGGACGCCGGAGGAGATAGAGAGATATTGGCTTATGAAACACGGCGTCGTTTTTGCCAACAGACGAAGAGACTTTTTTAGGAAATGAttttttttgtttggattaaaagaaaattttcctctccttaattcacaagacaagaaaaaaaggaaatgtacctgtccttgaattactattttggaatgtataattatctatatatataagaagaaaaaattgcttaggaatttcaaatttttaccagcctccatcgacacatgatatatc'
    window_size = 90
    
    print(f"--- VERIFY FIXED LOGIC ---")
    
    # 1. Test Ref Orientation
    idx, is_rc = find_target_in_reference(reference, sgrna)
    print(f"Target found in reference at index: {idx}, is_rc: {is_rc}")
    
    ref_cut_site = calculate_cut_site(idx, sgrna, is_rc=is_rc)
    ref_window = extract_window(reference, ref_cut_site, window_size)
    if is_rc:
        ref_window = reverse_complement(ref_window)
        print("Ref window normalized (RC).")
    
    # 2. Test Full Analysis on subset
    print(f"\nProcessing first 2000 reads from {fastq_path}...")
    try:
        reads = parse_fastq(fastq_path)
        subset = reads[:2000]
        
        matched = 0
        wildtype = 0
        modified = 0
        indels = 0
        
        for i, rd in enumerate(subset):
            cs, win = process_read(rd, sgrna, window_size=window_size)
            if cs is not None:
                matched += 1
                cat = classify_mutation(ref_window, win)
                if cat == 'wildtype':
                    wildtype += 1
                else:
                    modified += 1
                    if cat in ['insertion', 'deletion', 'mixed']:
                        indels += 1
                
                if matched <= 5:
                    print(f"Read {i} classification: {cat}")
                    # print(f"  Ref: {ref_window}")
                    # print(f"  Read:{win}")
                
        print(f"\n--- Results for subset of 2000 reads ---")
        print(f"Matched Reads: {matched}")
        print(f"Wildtype: {wildtype}")
        print(f"Modified: {modified}")
        print(f"Indels: {indels}")
        
        if matched > 0:
            print(f"Indel Rate (vs Aligned): {(indels/matched)*100:.2f}%")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    if os.path.basename(os.getcwd()) != 'crispr_backend':
        os.chdir('crispr_backend')
    verify_fixed_logic()
