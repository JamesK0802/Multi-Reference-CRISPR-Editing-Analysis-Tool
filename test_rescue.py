import sys
import json
sys.path.append('crispr_backend')
from crispr_backend.run_local import process_files_multi

file_paths = ["crispr_backend/data/sample.fastq"]
genes_payload = [
    {
        "gene": "G1",
        "sequence": "ACTG",
        "targets": [{"target_id": "T1", "sgrna_seq": "ACTG"}]
    }
]

# We need real payload, let's load barcode60_target.json
with open('crispr_backend/data/barcode60_target.json', 'r') as f:
    genes_payload = json.load(f)

res = process_files_multi(
    file_paths, genes_payload, 
    analyze_ambiguous=True, rescue_ambiguous=True
)
print("Finished!")
