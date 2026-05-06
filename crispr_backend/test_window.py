import sys
from run_local import run_analysis

target = {
    "target_id": "Nicole",
    "reference_seq": "ctaggattaatcagacatgcgcagttatataataatcagtttgattttcttttccttttcgagcccctctctctctcactcttttcttttccgagaacccaacaaaaaaaaagctactattaatccttcccctcgtgaggaaatcatttcttcttgtttctcgagatttattctctttctctctctctttctctgtgtgtttcgtgtcttcagattagttcgATGTTTCGTTCAGACAAGGCGGAAAAAATGGATAAACGACGACGGAGACAGAGCAAAGCCAAGGCTTCTTGTTCCGAAGgtctgatttctctttgtttctctctatatctttttgatcggtttgagtctgattttgtatgtttgtttcgcagAGGTGAGTAGTATCGAATGGGAAGCTGTGAAGATGTCAGAAGAAGAAGAAGATCTCATTTCTCGGATGTATAAACTCGTTGGCGACAGgttagagactctttctctctcgatccatcttgttgctttctcttttttttggtctttcatgttttgtcgaatctgcttagattttgatctcaaagtcggtcgtttatttatgcattttcttggtttttctattatattattgggtctaacttaccgagctgtcaatgactgtgttcagcctgatttttgatcttgttattattctctgttttttgttttagttgttcaaatagcaaaacctaatcaagatttcgttttcagtttctttttttatatatgattctttagcaaaacatattcttaatttatgtcagaactcactttggctagtttggttcaattttgattacagcatgtttgtatgaagtcaaagtgtaaattacgattttggttcggttccatagaattttaaccgaattacaaactttatgcggtttttatcggaataaaaggtatttggttaagtgtaagttcctcaacactgactgttagcctatcctacgtggcgcgtagGTGGGAGTTGATCGCCGGAAGGATCCCGGGACGGACGCCGGAGGAGATAGAGAGATATTGGCTTATGAAACACGGCGTCGTTTTTGCCAACAGACGAAGAGACTTTTTTAGGAAATGAttttttttgtttggattaaaagaaaattttcctctccttaattcacaagacaagaaaaaaaggaaatgtacctgtccttgaattactattttggaatgtataattatctatatatataagaagaaaaaattgcttaggaatttcaaatttttaccagcctccatcgacacatgatatatc",
    "sgrna_seq": "AATATCTCTCTATCTCCTC",
    "window_size": 90
}

# The target is detected as Reverse Complement in reference at index 1015
# The reference sequence around there:
# 1015: "GAGGATAGAGAGATATT" -> RC is "AATATCTCTCTATCCTC"
# Create a synthetic fastq file that contains the exact reference sequence around the cut site
# length ~ 150bp

import core.classifier as classifier
ref = target["reference_seq"]
grna = target["sgrna_seq"]
cut_info = classifier.find_grna_cut_site(ref, grna)

# create a 150bp window around the cut site as the synthetic read
read_seq = classifier.extract_window(ref, cut_info["cut_site"], 150)
read_qual = "I" * len(read_seq)

with open("data/synthetic.fastq", "w") as f:
    f.write(f"@read1\n{read_seq}\n+\n{read_qual}\n")

test_file = "data/synthetic.fastq"

print("Running with 90:")
target["window_size"] = 90
res90 = run_analysis(test_file, [target])
print("SUMMARY 90:", res90["target_results"][0]["summary"])

print("\nRunning with 120:")
target["window_size"] = 120
res120 = run_analysis(test_file, [target])
print("SUMMARY 120:", res120["target_results"][0]["summary"])

print("\nRunning with 150:")
target["window_size"] = 150
res150 = run_analysis(test_file, [target])
print("SUMMARY 150:", res150["target_results"][0]["summary"])

print("\nRunning with 160:")
target["window_size"] = 160
res160 = run_analysis(test_file, [target])
print("SUMMARY 160:", res160["target_results"][0]["summary"])
