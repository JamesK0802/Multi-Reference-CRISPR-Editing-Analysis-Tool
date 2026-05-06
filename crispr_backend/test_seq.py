from core.analyzer import classify_mutation_with_alignment
ref = "ATCG" * 10 # 40bp
read = "ATCG" * 8  # 32bp
cat, has_sub, net_indel, tokens = classify_mutation_with_alignment(ref, read)
print(f"Cat: {cat}, Sub: {has_sub}, Indel: {net_indel}")
