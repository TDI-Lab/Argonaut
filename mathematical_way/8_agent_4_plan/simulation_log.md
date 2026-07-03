# EPOS SIMULATION LOG

- Date: 2026-01-20 15:48:00
- Input Source: input_8_4_least.csv
- Brute Force Duration: 0.7741 seconds
- EPOS Simulation Duration: 43.6251 seconds

## PART 1: BRUTE FORCE ANALYSIS
- Total Combinations Analyzed: 4^8 = 65536
- Global Optimum GC: 4.067828
- Best Configuration (Indices): (0, 1, 3, 3, 3, 3, 2, 2)
- Corresponding LC: 3.1250

### GC Distribution Statistics
- Min GC: 4.067828
- Max GC: 12.097517
- Mean GC: 7.832418
- Median GC: 7.795886
- Std Dev GC: 0.998868

## PART 2: EPOS SIMULATION RESULTS
- Total Starting States Tested: 65536
- Max Iterations per Run: 5
- Success Rate: 21.45% (14056/65536 reached optimum)

### Convergence Statistics
- Unique Final States: 32
- Final GC Range: [4.067828, 5.965623]
- Final LC Range: [1.8750, 3.2500]
