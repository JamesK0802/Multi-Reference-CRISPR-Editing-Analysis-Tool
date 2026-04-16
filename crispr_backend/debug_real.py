import os
import sys

# Add core to path
sys.path.append('core')

from core.parser import parse_fastq
from core.aligner import process_read, extract_window, calculate_cut_site
from core.analyzer import classify_mutation

def debug_real_data():
    fastq_path = 'data/barcode60.fq'
    sgrna = 'AATATCTCTCTATCTCCTC'
    reference = 'ctaggattaatcagacatgcgcagttatataataatcagtttgattttcttttccttttcgagcccctctctctctcactcttttcttttccgagaacccaacaaaaaaaaagctactattaatccttcccctcgtgaggaaatcatttcttcttgtttctcgagatttattctctttctctctctctttctctgtgtgtttcgtgtcttcagattagttcgATGTTTCGTTCAGACAAGGCGGAAAAAATGGATAAACGACGACGGAGACAGAGCAAAGCCAAGGCTTCTTGTTCCGAAGgtctgatttctctttgtttctctctatatctttttgatcggtttgagtctgattttgtatgtttgtttcgcagAGGTGAGTAGTATCGAATGGGAAGCTGTGAAGATGTCAGAAGAAGAAGAAGATCTCATTTCTCGGATGTATAAACTCGTTGGCGACAGgttagagactctttctctctcgatccatcttgttgctttctcttttttttggtctttcatgttttgtcgaatctgcttagattttgatctcaaagtcggtcgtttatttatgcattttcttggtttttctattatattattgggtctaacttaccgagctgtcaatgactgtgttcagcctgatttttgatcttgttattattctctgttttttgttttagttgttcaaatagcaaaacctaatcaagatttcgttttcagtttctttttttatatatgattctttagcaaaacatattcttaatttatgtcagaactcactttggctagtttggttcaattttgattacagcatgtttgtatgaagtcaaagtgtaaattacgattttggttcggttccatagaattttaaccgaattacaaactttatgcggtttttatcggaataaaaggtatttggttaagtgtaagttcctcaacactgactgttagcctatcctacgtggcgcgtagGTGGGAGTTGATCGCCGGAAGGATCCCGGGACGGACGCCGGAGGAGATAGAGAGATATTGGCTTATGAAACACGGCGTCGTTTTTGCCAACAGACGAAGAGACTTTTTTAGGAAATGAttttttttgtttggattaaaagaaaattttcctctccttaattcacaagacaagaaaaaaaggaaatgtacctgtccttgaattactattttggaatgtataattatctatatatataagaagaaaaaattgcttaggaatttcaaatttttaccagcctccatcgacacatgatatatc'
    
    print(f"--- DEBUG REAL DATA ---")
    print(f"sgRNA: {sgrna}")
    print(f"Reference Length: {len(reference)}")
    
    # Check if sgRNA exists in reference
    found_idx = reference.lower().find(sgrna.lower())
    print(f"sgRNA found in reference at index: {found_idx}")
    
    if found_idx == -1:
        # Check reverse complement
        def rev_comp(seq):
            complement = {'A': 'T', 'C': 'G', 'G': 'C', 'T': 'A', 'N': 'N', 'a': 't', 'c': 'g', 'g': 'c', 't': 'a'}
            return "".join(complement.get(base, base) for base in reversed(seq))
        
        rc_sgrna = rev_comp(sgrna)
        print(f"RC sgRNA: {rc_sgrna}")
        rc_found_idx = reference.lower().find(rc_sgrna.lower())
        print(f"RC sgRNA found in reference at index: {rc_found_idx}")

    # Check first 10 reads
    print(f"\nReading FASTQ (first 100 reads for speed)...")
    try:
        # Limited parse for debugging
        all_reads = parse_fastq(fastq_path)
        print(f"Total reads parsed: {len(all_reads)}")
        
        aligned_count = 0
        for i, read in enumerate(all_reads[:100]):
            cut_site, window = process_read(read, sgrna, window_size=90)
            if cut_site is not None:
                aligned_count += 1
                if aligned_count <= 5:
                    print(f"Read {i} alignment success! Cut site: {cut_site}")
            
        print(f"Aligned {aligned_count} out of 100 reads.")
    except Exception as e:
        print(f"Error parsing FASTQ: {e}")

if __name__ == "__main__":
    # Ensure current dir is backend
    if os.path.basename(os.getcwd()) != 'crispr_backend':
        os.chdir('crispr_backend')
    debug_real_data()
