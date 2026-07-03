# EPOS SIMULATION LOG

- Date: 2026-01-20 15:45:19
- Input Source: input_8_5_least.csv
- Brute Force Duration: 4.5818 seconds
- EPOS Simulation Duration: 352.0629 seconds

## PART 1: BRUTE FORCE ANALYSIS
- Total Combinations Analyzed: 5^8 = 390625
- Global Optimum GC: 3.595172
- Best Configuration (Indices): (3, 0, 1, 1, 2, 1, 4, 3)
- Corresponding LC: 2.8750

### GC Distribution Statistics
- Min GC: 3.595172
- Max GC: 12.968284
- Mean GC: 7.975478
- Median GC: 7.950344
- Std Dev GC: 1.077299

## PART 2: EPOS SIMULATION RESULTS
- Total Starting States Tested: 390625
- Max Iterations per Run: 5
- Success Rate: 19.33% (75500/390625 reached optimum)

### Convergence Statistics
- Unique Final States: 55
- Final GC Range: [3.595172, 5.594133]
- Final LC Range: [2.7500, 3.8750]
