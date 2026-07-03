# EPOS SIMULATION LOG

- Date: 2026-01-20 15:53:37
- Input Source: input_9_4_least.csv
- Brute Force Duration: 3.1910 seconds
- EPOS Simulation Duration: 207.0766 seconds

## PART 1: BRUTE FORCE ANALYSIS
- Total Combinations Analyzed: 4^9 = 262144
- Global Optimum GC: 4.827927
- Best Configuration (Indices): (3, 1, 2, 2, 1, 2, 3, 3, 1)
- Corresponding LC: 3.0000

### GC Distribution Statistics
- Min GC: 4.827927
- Max GC: 15.826462
- Mean GC: 9.091276
- Median GC: 9.004660
- Std Dev GC: 1.348199

## PART 2: EPOS SIMULATION RESULTS
- Total Starting States Tested: 262144
- Max Iterations per Run: 5
- Success Rate: 34.55% (90560/262144 reached optimum)

### Convergence Statistics
- Unique Final States: 32
- Final GC Range: [4.827927, 6.492230]
- Final LC Range: [1.7778, 3.3333]
