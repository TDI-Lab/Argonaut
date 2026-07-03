# EPOS Simulation: Global vs Local Cost Analysis

This project simulates the EPOS (Economic Planning and Optimized Selections) algorithm to analyze the trade-off between Global Cost (variance of aggregate signal) and Local Cost (agent discomfort).

## Features

### 1. Brute Force Ground Truth Analysis

- **Exhaustive Search:** The code calculates the Global Cost (GC) and Local Cost (LC) for **every possible combination** of agent plans ($Plans^{Agents}$).
- **Global Optimum:** Identifies the absolute best configuration (minimum GC) to serve as a baseline.
- **Distribution Stats:** Calculates statistics (min, max, mean, std dev) for the entire solution space.

### 2. Comprehensive Simulation Testing

- **All-State Initiation:** The simulation runs EPOS from **every possible starting configuration**.
- **Convergence Check:** Checks if the algorithm successfully converged to the known Global Optimum.
- **Success Rate:** Calculates the percentage of starting states that lead to the global optimum.

### 3. Automated Workflow & Reporting

- **Automated Generation:** Scripts automatically generate input data from Gaussian datasets relative to the number of agents and plans you specify.
- **CSV Outputs:** Scalable output format to support large datasets ($4^{10}$ rows).
  - `solutionwiseresults.csv`: Contains GC/LC for every possible combination.
  - `epossimulationresults.csv`: Detailed logs of every simulation run.
- **Markdown Log (`simulation_log.md`):** A formatted summary file containing:
  - Execution times (Brute Force vs EPOS).
  - Success Rate.
  - Convergence statistics.

### 4. Flexible Plan Selection & Costing

- **Index-Based Costing:** Local Cost is derived directly from the plan's position in the source file (e.g., Row 1 = Cost 1, Row 50 = Cost 50). This simulates real-world preferences where sorted plans represent increasing discomfort.
- **Selection Strategies:** You can control _which_ plans are selected for the simulation:
  - `top`: Picks top K plans (best options, lowest cost).
  - `bottom`: Picks bottom K plans (worst options, highest cost).
  - `quantile_25` / `50` / `75`: Picks K plans starting from specific percentiles (e.g., median options).
  - `random`: Picks random plans.

## How to Run

### 1. Prerequisites & Setup

It is recommended to run this project in a virtual environment to manage dependencies.

**Unix/macOS:**

```bash
# Create virtual environment
python3 -m venv venv

# Activate environment
source venv/bin/activate

# Install dependencies
pip install numpy pandas jupyter nbconvert
```

**Windows:**

```bash
# Create virtual environment
python -m venv venv

# Activate environment
.\venv\Scripts\activate

# Install dependencies
pip install numpy pandas jupyter nbconvert
```

### 2. Run Experiment (Automated)

The recommended way to run the simulation is using the `run_experiment.py` script. This handles data generation, notebook execution, and result organization automatically.

```bash
# Syntax: python run_experiment.py --agents [N] --plans [K] --selection [STRATEGY]
python run_experiment.py --agents 5 --plans 3 --selection top
```

**Selection Options:** `top` (default), `bottom`, `random`, `quantile_25`, `quantile_50`, `quantile_75`.

This will:

1.  Generate input CSV (e.g., `input_5_3_top.csv`) by selecting plans based on your strategy.
2.  Execute the analysis logic in `code.ipynb`.
3.  Save all results to a timestamped folder (e.g., `5_agent_3_plan_top_2026-01-20_14-30-00/`).
4.  Move the generated input file into that folder for archiving.

### 3. Manual Use (Optional)

If you prefer running components individually:

1.  **Generate Data:**

    ```bash
    python generate_csv_from_gaussian.py --agents 5 --plans 3 --output my_input.csv
    ```

2.  **Run Analysis:**
    Set the environment variable and run the notebook:
    ```bash
    export EPOS_INPUT_FILE=my_input.csv
    jupyter nbconvert --to notebook --execute --inplace code.ipynb
    ```
