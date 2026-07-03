#!/usr/bin/env python3
"""
Brute-force exhaustive search over all agent plan combinations.
Usage: python3 brute_force_runner.py <plans_dir> <output_dir>
Outputs: solutionwiseresults.csv, summary.json
"""
import sys, os, json, csv, itertools
import numpy as np

MAX_COMBINATIONS = 1_000_000

def load_agents(plans_dir):
    agents = {}
    for fname in sorted(os.listdir(plans_dir)):
        if not fname.endswith('.plans'):
            continue
        try:
            idx = int(fname.replace('agent_', '').replace('.plans', ''))
        except ValueError:
            continue
        plans = []
        with open(os.path.join(plans_dir, fname)) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                cost_str, vec_str = line.split(':', 1)
                plans.append((float(cost_str), list(map(float, vec_str.split(',')))))
        if plans:
            agents[idx] = plans
    return agents

def run(plans_dir, output_dir):
    agents = load_agents(plans_dir)
    if not agents:
        print(json.dumps({'error': 'No agent plan files found in ' + plans_dir}))
        sys.exit(1)

    agent_ids   = sorted(agents.keys())
    n_agents    = len(agent_ids)
    plan_counts = [len(agents[i]) for i in agent_ids]
    total       = 1
    for pc in plan_counts:
        total *= pc

    if total > MAX_COMBINATIONS:
        print(json.dumps({'error': f'Too many combinations ({total:,}). Limit is {MAX_COMBINATIONS:,}. '
                                    'Reduce the number of agents or plans per agent.'}))
        sys.exit(2)

    dim = len(agents[agent_ids[0]][0][1])
    results = []
    best_gc, best_lc, best_combo = float('inf'), None, None

    for combo in itertools.product(*[range(pc) for pc in plan_counts]):
        agg    = np.zeros(dim)
        lc_sum = 0.0
        for i, plan_idx in enumerate(combo):
            cost, vec = agents[agent_ids[i]][plan_idx]
            agg    += np.array(vec)
            lc_sum += cost
        gc = float(np.var(agg))
        lc = lc_sum / n_agents
        results.append((list(combo), gc, lc))
        if gc < best_gc:
            best_gc, best_lc, best_combo = gc, lc, list(combo)

    os.makedirs(output_dir, exist_ok=True)

    with open(os.path.join(output_dir, 'solutionwiseresults.csv'), 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['Indices', 'GC', 'LC'])
        for combo, gc, lc in results:
            w.writerow([str(tuple(combo)), round(gc, 8), round(lc, 8)])

    gcs = [r[1] for r in results]
    lcs = [r[2] for r in results]

    # Label for best combo: agent_i → plan_idx
    best_label = ', '.join(f'agent_{agent_ids[i]}→plan_{best_combo[i]}' for i in range(n_agents))

    summary = {
        'total_combinations': total,
        'n_agents': n_agents,
        'plans_per_agent': plan_counts,
        'best_gc': round(best_gc, 8),
        'best_lc': round(best_lc, 8),
        'best_combo_indices': best_combo,
        'best_combo_label': best_label,
        'worst_gc': round(float(max(gcs)), 8),
        'mean_gc': round(float(np.mean(gcs)), 8),
        'min_lc': round(float(min(lcs)), 8),
        'max_lc': round(float(max(lcs)), 8),
    }
    with open(os.path.join(output_dir, 'summary.json'), 'w') as f:
        json.dump(summary, f, indent=2)

    print(json.dumps({'status': 'ok', **summary}))

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print('Usage: brute_force_runner.py <plans_dir> <output_dir>')
        sys.exit(1)
    run(sys.argv[1], sys.argv[2])
