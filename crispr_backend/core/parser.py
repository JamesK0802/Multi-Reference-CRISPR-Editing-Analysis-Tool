from Bio import SeqIO

def parse_fastq(filepath):
    """
    Reads a FASTQ file and returns a list of (sequence, quality_scores) tuples.
    """
    results = []
    # Read the fastq file
    with open(filepath, "r") as handle:
        for record in SeqIO.parse(handle, "fastq"):
            seq = str(record.seq)
            qual = record.letter_annotations["phred_quality"]
            results.append((seq, qual))
    return results
