from Bio import SeqIO

def parse_fastq(filepath):
    """
    Reads a FASTQ file and returns a list of sequence strings.
    """
    sequences = []
    # Read the fastq file
    with open(filepath, "r") as handle:
        for record in SeqIO.parse(handle, "fastq"):
            sequences.append(str(record.seq))
    return sequences
