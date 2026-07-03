# EPOS SIMULATION LOG

- Date: 2026-01-20 15:55:01
- Input Source: input_10_3_least.csv
- Brute Force Duration: 0.7442 seconds
- EPOS Simulation Duration: 37.0656 seconds

## PART 1: BRUTE FORCE ANALYSIS
- Total Combinations Analyzed: 3^10 = 59049
- Global Optimum GC: 5.104047
- Best Configuration (Indices): (2, 1, 2, 1, 2, 0, 2, 0, 1, 0)
- Corresponding LC: 2.1000

### GC Distribution Statistics
- Min GC: 5.104047
- Max GC: 15.842128
- Mean GC: 9.653674
- Median GC: 9.593087
- Std Dev GC: 1.396324

## PART 2: EPOS SIMULATION RESULTS
- Total Starting States Tested: 59049
- Max Iterations per Run: 5
- Success Rate: 8.23% (4857/59049 reached optimum)

### Convergence Statistics
- Unique Final States: 13
- Final GC Range: [5.104047, 7.337321]
- Final LC Range: [1.7000, 2.5000]
