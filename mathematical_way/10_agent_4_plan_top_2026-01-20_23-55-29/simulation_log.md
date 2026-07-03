# EPOS SIMULATION LOG

- Date: 2026-01-21 00:11:22
- Input Source: input_10_4_top.csv
- Brute Force Duration: 12.9980 seconds
- EPOS Simulation Duration: 932.5825 seconds

## PART 1: BRUTE FORCE ANALYSIS
- Total Combinations Analyzed: 4^10 = 1048576
- Global Optimum GC: 4.704662
- Best Configuration (Indices): (3, 1, 3, 0, 3, 2, 3, 1, 1, 0)
- Corresponding LC: 2.7000

### GC Distribution Statistics
- Min GC: 4.704662
- Max GC: 16.246062
- Mean GC: 10.157017
- Median GC: 10.106935
- Std Dev GC: 1.478367

## PART 2: EPOS SIMULATION RESULTS
- Total Starting States Tested: 1048576
- Max Iterations per Run: 5
- Success Rate: 9.38% (98352/1048576 reached optimum)

### Convergence Statistics
- Unique Final States: 43
- Final GC Range: [4.704662, 7.118556]
- Final LC Range: [1.7000, 3.2000]
