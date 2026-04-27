import time
import random

reads = [''.join(random.choices('ACGT', k=150)) for _ in range(3000)]

start = time.time()
clusters = []
for seq in reads:
    kmers = set(seq[i:i+10] for i in range(len(seq)-9))
    found = False
    for c in clusters:
        rep_kmers = c[0]
        if len(kmers & rep_kmers) / len(kmers) >= 0.6:
            c[2].append(seq)
            found = True
            break
    if not found:
        clusters.append([kmers, seq, [seq]])
print(f"Time: {time.time() - start:.3f}s, Clusters: {len(clusters)}")
