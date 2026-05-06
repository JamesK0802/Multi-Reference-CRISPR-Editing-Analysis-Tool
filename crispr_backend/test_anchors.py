from core.classifier import find_grna_cut_site, extract_window

ref = "ctaggattaatcagacatgcgcagttatataataatcagtttgattttcttttccttttcgagcccctctctctctcactcttttcttttccgagaacccaacaaaaaaaaagctactattaatccttcccctcgtgaggaaatcatttcttcttgtttctcgagatttattctctttctctctctctttctctgtgtgtttcgtgtcttcagattagttcgATGTTTCGTTCAGACAAGGCGGAAAAAATGGATAAACGACGACGGAGACAGAGCAAAGCCAAGGCTTCTTGTTCCGAAGgtctgatttctctttgtttctctctatatctttttgatcggtttgagtctgattttgtatgtttgtttcgcagAGGTGAGTAGTATCGAATGGGAAGCTGTGAAGATGTCAGAAGAAGAAGAAGATCTCATTTCTCGGATGTATAAACTCGTTGGCGACAGgttagagactctttctctctcgatccatcttgttgctttctcttttttttggtctttcatgttttgtcgaatctgcttagattttgatctcaaagtcggtcgtttatttatgcattttcttggtttttctattatattattgggtctaacttaccgagctgtcaatgactgtgttcagcctgatttttgatcttgttattattctctgttttttgttttagttgttcaaatagcaaaacctaatcaagatttcgttttcagtttctttttttatatatgattctttagcaaaacatattcttaatttatgtcagaactcactttggctagtttggttcaattttgattacagcatgtttgtatgaagtcaaagtgtaaattacgattttggttcggttccatagaattttaaccgaattacaaactttatgcggtttttatcggaataaaaggtatttggttaagtgtaagttcctcaacactgactgttagcctatcctacgtggcgcgtagGTGGGAGTTGATCGCCGGAAGGATCCCGGGACGGACGCCGGAGGAGATAGAGAGATATTGGCTTATGAAACACGGCGTCGTTTTTGCCAACAGACGAAGAGACTTTTTTAGGAAATGAttttttttgtttggattaaaagaaaattttcctctccttaattcacaagacaagaaaaaaaggaaatgtacctgtccttgaattactattttggaatgtataattatctatatatataagaagaaaaaattgcttaggaatttcaaatttttaccagcctccatcgacacatgatatatc"
grna = "AATATCTCTCTATCTCCTC"

cut_info = find_grna_cut_site(ref, grna)
cut_site = cut_info['cut_site']
print(f"Cut site: {cut_site}")

for w in [70, 90, 110]:
    win = extract_window(ref, cut_site, w)
    left = win[:12]
    right = win[-12:]
    
    # Check if they are unique in a 150bp read
    # 150bp read centered at cut_site
    read = extract_window(ref, cut_site, 150)
    
    print(f"Window: {w}")
    print(f"  Left Anchor: {left} (Count in read: {read.count(left)})")
    print(f"  Right Anchor: {right} (Count in read: {read.count(right)})")

