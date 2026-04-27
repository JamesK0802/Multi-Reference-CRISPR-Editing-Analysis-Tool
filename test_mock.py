import sys
sys.path.append('crispr_backend')
from crispr_backend.run_local import process_files_multi

file_paths = []
genes_payload = [
    {
        "gene": "G1",
        "sequence": "ACTG",
        "targets": [{"target_id": "T1", "sgrna_seq": "ACTG"}]
    }
]

# We can directly mock `run_local` methods but it's easier to mock data.
