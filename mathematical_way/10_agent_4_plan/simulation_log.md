# EPOS SIMULATION LOG

- Date: 2026-01-20 02:21:12
- Input Source: input_10_4.csv
- Brute Force Duration: 12.7679 seconds
- EPOS Simulation Duration: 954.4552 seconds

## PART 1: BRUTE FORCE ANALYSIS
- Total Combinations Analyzed: 4^10 = 1048576
- Global Optimum GC: 5.010722
- Best Configuration (Indices): (2, 2, 1, 1, 1, 3, 3, 3, 2, 1)
- Corresponding LC: 0.4350

### GC Distribution Statistics
- Min GC: 5.010722
- Max GC: 18.426468
- Mean GC: 10.495042
- Median GC: 10.435124
- Std Dev GC: 1.537527

## PART 2: EPOS SIMULATION RESULTS
- Total Starting States Tested: 1048576
- Max Iterations per Run: 5
- Success Rate: 27.00% (283100/1048576 reached optimum)

### Convergence Statistics
- Unique Final States: 42
- Final GC Range: [5.010722, 7.075918]
- Final LC Range: [0.3600, 0.6950]
