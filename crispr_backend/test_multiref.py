import json
from core.multi_reference_assigner import assign_reads_to_references

def test_demux():
    references = [
        {"gene": "GeneA", "sequence": "ATGCGTACGTTAGCTAGCTAGCTGATCGATGCTAGCTAGCTAGC"},
        {"gene": "GeneB", "sequence": "CCGGATATCGATCGATCGACTAGCTAGCTAGCTACGATCGATCG"},
        {"gene": "GeneC", "sequence": "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT"}
    ]
    
    reads_data = [
        ("ATGCGTACGTTAGCTAGCTAGCTGATCGATGCTAGCTAGCTA", [30]*42), # matches GeneA
        ("CCGGATATCGATCGATCGACTAGCTAGCTAGCTACGATCGA", [30]*41), # matches GeneB
        ("GCTAGCTAGCTAGCATCGATCAGCTAGCTAGCTAACGTACGCAT", [30]*44), # RC of GeneA
        ("CGATCGATCGTAGCTAGCTAGCTAGTCGATCGATCGATATCCGG", [30]*44), # RC of GeneB
        ("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", [30]*44), # RC of GeneC
        ("ATGCGTACGTTAGCTAGCTAGCTGATCGATGCTAGCTAGCGG", [30]*42), # slightly off GeneA
        ("ATGCGTACGTTAGCGGATATCGATCGATCGACTAGCTAGCTA", [30]*42), # ambiguous
    ]
    
    result = assign_reads_to_references(reads_data, references, margin_threshold=0.1)
    
    print("\n--- SAMPLE DEBUG OUTPUT ---")
    print("Genes:")
    for g in result["genes"]:
        print(f"  {g['gene']}: {g['count']} reads (avg score: {g['average_score']:.3f})")
    print(f"Ambiguous reads: {len(result['ambiguous_reads'])}")
    print("---------------------------\n")
    
if __name__ == "__main__":
    test_demux()
