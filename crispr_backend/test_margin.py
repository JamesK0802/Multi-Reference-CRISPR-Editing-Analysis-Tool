from core.classifier import score_read_against_window
g1 = "CACCTCACTGAACCTGCCGAGTTCGGGTCCGAGCTGCAGTTAAGTTATAAAAAACAGTTCCTGAAATTGATGATCCCACGGAATCTTAA"
g2 = "CACCTCACTGAACCTGCCGAGTTCGGGTCCGAGCTGCAGTTAAGTTATAAAAAACAATTCCTGAAATTGATGATCCCACGGAATCTTAA"
score1 = score_read_against_window(g1, g1)
score2 = score_read_against_window(g1, g2)
print(f"Score1: {score1}, Score2: {score2}, Gap: {score1 - score2}")
