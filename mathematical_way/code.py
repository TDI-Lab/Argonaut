#!/usr/bin/env python3
"""
Brute-force EPOS analysis.
Reads EPOS_INPUT_FILE (CSV), runs exhaustive search + greedy simulation,
writes outputs to EPOS_OUTPUT_FOLDER.
"""
import itertools
import os
import shutil
import time
import signal
import sys

import numpy as np
import pandas as pd

# Graceful termination handling
interrupted = False

def sigterm_handler(signum, frame):
    global interrupted
    print(f"code.py received signal {signum}. Stopping brute-force search gracefully...")
    interrupted = True

signal.signal(signal.SIGTERM, sigterm_handler)
signal.signal(signal.SIGINT, sigterm_handler)

# ── 1. Load input ──────────────────────────────────────────────────────────

csv_file = os.environ.get('EPOS_INPUT_FILE', 'input_9_4.csv')
print(f"Processing Input File: {csv_file}")

df_input = pd.read_csv(csv_file, sep=';')

NUM_AGENTS  = len(df_input)
plan_cols   = [c for c in df_input.columns if c.startswith('plan_')]
NUM_PLANS   = len(plan_cols)
agent_names = [f"Agent_{vid}" for vid in df_input['voter_id']]
MAX_ITERATIONS = 5

np.random.seed(42)

agents = {}
for index, row in df_input.iterrows():
    name = agent_names[index]
    agents[name] = []
    for p in range(NUM_PLANS):
        raw = row[f"plan_{p+1}"]
        # Skip empty/NaN slots (agents with fewer plans than num_plans)
        if pd.isna(raw) or str(raw).strip().lower() in ('', 'nan', 'none'):
            continue
        cell_value = str(raw)
        if ':' in cell_value:
            parts = cell_value.split(':', 1)
            cost   = float(parts[0])
            vec_str = parts[1]
        else:
            cost    = round(np.random.rand(), 2)
            vec_str = cell_value
        try:
            vec = np.fromstring(vec_str, sep=',')
        except ValueError:
            vec = np.fromstring(vec_str.replace('[', '').replace(']', ''), sep=',')
        if vec.size == 0:
            continue
        agents[name].append({'vec': vec, 'cost': cost})

PLAN_DIM = len(agents[agent_names[0]][0]['vec'])
agent_plan_counts = [len(agents[name]) for name in agent_names]
print(f"Agents: {NUM_AGENTS}, Plans/agent: {agent_plan_counts}, Dim: {PLAN_DIM}")

# ── 2. Brute-force global optimum ─────────────────────────────────────────

total_combos = 1
for c in agent_plan_counts:
    total_combos *= c
print("=" * 60)
print(f"PART 1: BRUTE FORCE ({' × '.join(str(c) for c in agent_plan_counts)} = {total_combos} solutions)")
print("=" * 60)
t0 = time.time()
combinations = itertools.product(*[range(len(agents[name])) for name in agent_names])
bf_data = []
killed = False

for combo in combinations:
    if interrupted:
        killed = True
        break
    vecs  = [agents[agent_names[i]][combo[i]]['vec']  for i in range(NUM_AGENTS)]
    costs = [agents[agent_names[i]][combo[i]]['cost'] for i in range(NUM_AGENTS)]
    g_sum = np.sum(vecs, axis=0)
    bf_data.append({"Indices": combo, "GC": np.var(g_sum), "LC": sum(costs) / NUM_AGENTS})

print(f"Brute force took: {time.time() - t0:.4f}s")
if not bf_data:
    first_combo = tuple(0 for _ in agent_names)
    bf_data.append({"Indices": first_combo, "GC": 0.0, "LC": 0.0})

df_bf          = pd.DataFrame(bf_data)
best_row       = df_bf.sort_values("GC").iloc[0]
GLOBAL_MIN_GC  = best_row['GC']
GLOBAL_BEST    = best_row['Indices']
print(f"Global optimum: GC={GLOBAL_MIN_GC:.6f}, config={GLOBAL_BEST}")
bf_duration    = time.time() - t0

# ── 3. EPOS simulation from every starting position ───────────────────────

print("=" * 60)
print(f"PART 2: EPOS FROM ALL {total_combos} STARTING POSITIONS")
print("=" * 60)

t1 = time.time()
simulation_results    = []
iteration_history_rows = []

def get_stats(plan_indices):
    vecs  = [agents[agent_names[i]][plan_indices[i]]['vec']  for i in range(NUM_AGENTS)]
    costs = [agents[agent_names[i]][plan_indices[i]]['cost'] for i in range(NUM_AGENTS)]
    g_sum = np.sum(vecs, axis=0)
    return np.var(g_sum), sum(costs) / NUM_AGENTS, g_sum

for row in bf_data:
    if interrupted:
        killed = True
        break
    start_combo = row["Indices"]
    current_plans      = {name: start_combo[i] for i, name in enumerate(agent_names)}
    _, _, global_sum   = get_stats(list(current_plans.values()))

    for it in range(MAX_ITERATIONS):
        iter_row = {"Start_State": str(start_combo), "Iteration": it + 1}
        for i, name in enumerate(agent_names):
            iter_row[f"Agent {i}"] = agents[name][current_plans[name]]['cost']
        iteration_history_rows.append(iter_row)

        changes = 0
        for name in agent_names:
            curr_idx  = current_plans[name]
            curr_vec  = agents[name][curr_idx]['vec']
            partial   = global_sum - curr_vec
            best_idx  = curr_idx
            best_var  = np.var(global_sum)

            for p_idx in range(len(agents[name])):
                if p_idx == curr_idx:
                    continue
                pot_sum = partial + agents[name][p_idx]['vec']
                pot_var = np.var(pot_sum)
                if pot_var < best_var:
                    best_var = pot_var
                    best_idx = p_idx

            if best_idx != curr_idx:
                current_plans[name] = best_idx
                global_sum = partial + agents[name][best_idx]['vec']
                changes += 1

        if changes == 0:
            break

    final_indices = tuple(current_plans.values())
    final_gc, final_lc, _ = get_stats(final_indices)
    simulation_results.append({
        "Start_Indices":    str(start_combo),
        "Final_Indices":    str(final_indices),
        "Final_GC":         round(final_gc, 6),
        "Final_LC":         round(final_lc, 4),
        "Hit_Global_Optimum": bool(np.isclose(final_gc, GLOBAL_MIN_GC)),
    })

epos_duration = time.time() - t1
if killed and not iteration_history_rows:
    for row in bf_data:
        combo = row["Indices"]
        iter_row = {"Start_State": str(combo), "Iteration": 1}
        for i, name in enumerate(agent_names):
            iter_row[f"Agent {i}"] = agents[name][combo[i]]['cost']
        iteration_history_rows.append(iter_row)

if not simulation_results:
    first_combo = tuple(0 for _ in agent_names)
    simulation_results.append({
        "Start_Indices":    str(first_combo),
        "Final_Indices":    str(first_combo),
        "Final_GC":         0.0,
        "Final_LC":         0.0,
        "Hit_Global_Optimum": True,
    })

df_sim  = pd.DataFrame(simulation_results)
df_iter = pd.DataFrame(iteration_history_rows) if iteration_history_rows else pd.DataFrame(columns=["Start_State", "Iteration"])

total   = len(df_sim)
success = df_sim['Hit_Global_Optimum'].sum()
print(f"EPOS simulation took: {epos_duration:.4f}s")
print(f"Success rate: {success/total*100:.2f}% ({success}/{total} reached optimum)")

# ── 4. Write outputs ───────────────────────────────────────────────────────

output_dir = os.environ.get('EPOS_OUTPUT_FOLDER') or f"{NUM_AGENTS}_agent_{NUM_PLANS}_plan"
os.makedirs(output_dir, exist_ok=True)

df_sim.to_csv( os.path.join(output_dir, "epossimulationresults.csv"),  index=False)
df_bf.to_csv(  os.path.join(output_dir, "solutionwiseresults.csv"),    index=False)
df_iter.to_csv(os.path.join(output_dir, "iteration_cost_history.csv"), index=False)

try:
    if os.path.exists(csv_file):
        shutil.move(csv_file, output_dir)
except Exception as e:
    print(f"Warning: could not move input file: {e}")

log_path = os.path.join(output_dir, "simulation_log.md")
with open(log_path, "w") as f:
    f.write("# EPOS SIMULATION LOG\n\n")
    if killed:
        f.write("> [!WARNING]\n")
        f.write("> THIS RUN WAS KILLED BY THE USER. Results below are partial, based on evaluated combinations.\n\n")
    f.write(f"- Date: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
    f.write(f"- Input: {csv_file}\n")
    f.write(f"- Brute Force Duration: {bf_duration:.4f}s\n")
    f.write(f"- EPOS Simulation Duration: {epos_duration:.4f}s\n\n")
    f.write("## PART 1: BRUTE FORCE\n")
    f.write(f"- Total Combinations: {' × '.join(str(c) for c in agent_plan_counts)} = {total_combos}\n")
    f.write(f"- Global Optimum GC: {GLOBAL_MIN_GC:.6f}\n")
    f.write(f"- Best Config: {GLOBAL_BEST}\n")
    f.write(f"- Corresponding LC: {best_row['LC']:.4f}\n\n")
    f.write("### GC Distribution\n")
    f.write(f"- Min: {df_bf['GC'].min():.6f}\n")
    f.write(f"- Max: {df_bf['GC'].max():.6f}\n")
    f.write(f"- Mean: {df_bf['GC'].mean():.6f}\n")
    f.write(f"- Median: {df_bf['GC'].median():.6f}\n")
    f.write(f"- Std: {df_bf['GC'].std():.6f}\n\n")
    f.write("## PART 2: EPOS SIMULATION\n")
    f.write(f"- Starting States: {total}\n")
    f.write(f"- Max Iterations: {MAX_ITERATIONS}\n")
    f.write(f"- Success Rate: {success/total*100:.2f}% ({success}/{total})\n\n")
    f.write("### Convergence\n")
    f.write(f"- Unique Final States: {df_sim['Final_Indices'].nunique()}\n")
    f.write(f"- Final GC Range: [{df_sim['Final_GC'].min():.6f}, {df_sim['Final_GC'].max():.6f}]\n")
    f.write(f"- Final LC Range: [{df_sim['Final_LC'].min():.4f}, {df_sim['Final_LC'].max():.4f}]\n")

if killed:
    with open(os.path.join(output_dir, "killed.txt"), "w") as kf:
        kf.write("killed")

print(f"Outputs written to: {output_dir}/")
