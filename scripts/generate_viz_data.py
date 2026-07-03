#!/usr/bin/env python3
"""
generate_viz_data.py
Converts an EPOS output directory into experiments.json for EPOS-Visualizer.

Primary source: algorithm_log.txt  (written when logger.AlgorithmLogger=true)
Fallback:       radial_visualisation_new/table_iter_*.csv

Usage:
  python generate_viz_data.py <output_dir>
    --num_agents N --num_plans M --num_iterations I
    [--num_children C] [--alpha A] [--beta B] [--num_simulations S]
"""

import argparse
import csv
import json
import os
import re


# ---------------------------------------------------------------------------
# Parse algorithm_log.txt → per-iteration, per-agent plan + cost data
# (logic ported from generate_radial_pngs_new.py::parse_log_for_topology)
# ---------------------------------------------------------------------------

def parse_algorithm_log(log_path):
    """
    Returns (run_data, cost_cache) where:
      run_data  = {run_idx: {iter_num: {edges, selected_plans, local_costs, complex_costs}}}
      cost_cache = {(run, iter, agent, plan): global_cost}
    """
    run_data   = {}
    cost_cache = {}

    current_run        = 0
    current_iter_phase = None
    current_agent_phase = None
    calc_agent = calc_iter = calc_plan = None

    re_sim        = re.compile(r'=== Simulation (\d+) ===')
    re_calc_hdr   = re.compile(r'\[Plan Cost Calculation\] Agent (\d+) \(Iter (\d+)\)')
    re_cand_plan  = re.compile(r'\[Candidate Plan (\d+)\]')
    re_cand_gcost = re.compile(r'=> Global Cost = ([\d.]+)')
    re_iter_phase = re.compile(r'\[Iter (\d+)\] \[BOTTOM-UP PHASE\] Agent (\d+):')
    re_plan_id    = re.compile(r'I selected Plan ID: (\d+) \(Cost: ([\d.]+)\)')
    re_parent     = re.compile(r'Sending aggregated proposal to Parent \(Agent (\d+)\)')

    with open(log_path, 'r', encoding='utf-8', errors='replace') as f:
        for raw in f:
            line = raw.strip()
            if not line:
                continue

            m = re_sim.search(line)
            if m:
                current_run = int(m.group(1)) - 1
                continue

            m = re_calc_hdr.search(line)
            if m:
                calc_agent, calc_iter, calc_plan = int(m.group(1)), int(m.group(2)), None
                continue

            if calc_agent is not None:
                m = re_cand_plan.search(line)
                if m:
                    calc_plan = int(m.group(1))
                    continue
                m = re_cand_gcost.search(line)
                if m and calc_plan is not None:
                    cost_cache[(current_run, calc_iter, calc_agent, calc_plan)] = float(m.group(1))
                    continue
                if line.startswith('[') and 'Candidate Plan' not in line:
                    calc_agent = None

            m = re_iter_phase.search(line)
            if m:
                current_iter_phase  = int(m.group(1))
                current_agent_phase = int(m.group(2))
                run_data.setdefault(current_run, {})
                run_data[current_run].setdefault(current_iter_phase, {
                    'edges': [], 'selected_plans': {}, 'local_costs': {}, 'complex_costs': {}
                })
                continue

            if current_agent_phase is not None and current_iter_phase is not None:
                m = re_plan_id.search(line)
                if m:
                    pid, lcost = int(m.group(1)), float(m.group(2))
                    d = run_data[current_run][current_iter_phase]
                    d['selected_plans'][current_agent_phase] = pid
                    d['local_costs'][current_agent_phase]    = lcost
                    cc = cost_cache.get((current_run, current_iter_phase, current_agent_phase, pid))
                    if cc is not None:
                        d['complex_costs'][current_agent_phase] = cc
                    continue

                m = re_parent.search(line)
                if m:
                    run_data[current_run][current_iter_phase]['edges'].append(
                        (current_agent_phase, int(m.group(1)))
                    )

    return run_data, cost_cache


# ---------------------------------------------------------------------------
# Build edges
# ---------------------------------------------------------------------------

def edges_from_log(run_data, run_idx, num_agents, num_children):
    """Extract unique parent→child edges from the first iteration that has them."""
    if run_idx in run_data:
        for it_data in run_data[run_idx].values():
            if it_data['edges']:
                seen, edges = set(), []
                for child, parent in it_data['edges']:
                    key = (parent, child)
                    if key not in seen:
                        seen.add(key)
                        edges.append([parent, child])
                return edges
    return edges_from_bfs(num_agents, num_children)


def edges_from_bfs(num_agents, num_children):
    """Fallback: derive edges from the EPOS BFS tree structure."""
    edges = []
    for bfs_pos in range(num_agents):
        agent_id = num_agents - 1 - bfs_pos
        for c in range(1, num_children + 1):
            child_bfs = bfs_pos * num_children + c
            if child_bfs < num_agents:
                edges.append([agent_id, num_agents - 1 - child_bfs])
    return edges


# ---------------------------------------------------------------------------
# Build iterations list
# ---------------------------------------------------------------------------

def iterations_from_log(run_data, run_idx):
    if run_idx not in run_data:
        return []
    result = []
    for iter_num in sorted(run_data[run_idx]):
        d = run_data[run_idx][iter_num]
        agents = [
            {
                "id":          aid,
                "plan":        d['selected_plans'][aid],
                "localCost":   round(d['local_costs'].get(aid, 0.0),   6),
                "complexCost": round(d['complex_costs'].get(aid, 0.0), 6),
            }
            for aid in sorted(d['selected_plans'])
        ]
        if agents:
            result.append({"iteration": iter_num, "agents": agents})
    return result


def iterations_from_csvs(selected_plans_path, local_cost_path, complex_cost_path, run_idx=0):
    """
    Fallback when algorithm_log.txt is absent.
    Builds per-agent rows from selected-plans.csv, assigning the run-level
    mean cost to every agent (best we can do without per-agent cost CSVs).
    """
    if not os.path.exists(selected_plans_path):
        return []

    # Read per-run mean costs per iteration
    def read_iter_cost(path):
        costs = {}
        if not os.path.exists(path):
            return costs
        with open(path, newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            fields = reader.fieldnames or []
            target_col = f"Run-{run_idx}"
            run_col = target_col if target_col in fields else next((c for c in fields if c.startswith('Run-')), None)
            for row in reader:
                it = int(row['Iteration'])
                costs[it] = float(row[run_col]) if run_col else float(row.get('Mean', 0))
        return costs

    lc_by_iter = read_iter_cost(local_cost_path)
    cc_by_iter = read_iter_cost(complex_cost_path)

    result = []
    with open(selected_plans_path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        agent_cols = [c for c in (reader.fieldnames or []) if c.startswith('agent-')]
        by_iter = {}
        for row in reader:
            run = int(row['Run'])
            if run != run_idx:
                continue
            it = int(row['Iteration'])
            by_iter[it] = {int(c.split('-')[1]): int(row[c]) for c in agent_cols}

    for it in sorted(by_iter):
        plan_map = by_iter[it]
        lc = lc_by_iter.get(it, 0.0)
        cc = cc_by_iter.get(it, 0.0)
        agents = [{"id": aid, "plan": plan_map[aid], "localCost": lc, "complexCost": cc}
                  for aid in sorted(plan_map)]
        result.append({"iteration": it, "agents": agents})
    return result


# ---------------------------------------------------------------------------
# Global responses
# ---------------------------------------------------------------------------

def read_global_responses(output_dir, num_iterations, run_idx=0):
    path = os.path.join(output_dir, "global-response.csv")
    if not os.path.exists(path):
        return [{"iter": i, "values": []} for i in range(num_iterations)]
    by_iter = {}
    with open(path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        dim_cols = [k for k in (reader.fieldnames or []) if k.startswith('dim-')]
        for row in reader:
            if 'Run' in row and int(row['Run']) != run_idx:
                continue
            it = int(row['Iteration'])
            if it >= 0 and it not in by_iter:
                by_iter[it] = [float(row[c]) for c in dim_cols]
    return [{"iter": i, "values": by_iter.get(i, [])} for i in range(num_iterations)]


# ---------------------------------------------------------------------------
# Key iterations
# ---------------------------------------------------------------------------

def detect_key_iterations(iterations):
    if not iterations:
        return []
    key  = [0]
    prev = {a["id"]: a["plan"] for a in iterations[0]["agents"]}
    for it in iterations[1:]:
        curr = {a["id"]: a["plan"] for a in it["agents"]}
        if curr != prev:
            key.append(it["iteration"])
            prev = curr
    return key


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    p = argparse.ArgumentParser(description="Generate experiments.json for EPOS-Visualizer")
    p.add_argument("output_dir")
    p.add_argument("--num_agents",      type=int,   required=True)
    p.add_argument("--num_plans",       type=int,   required=True)
    p.add_argument("--num_iterations",  type=int,   required=True)
    p.add_argument("--num_children",    type=int,   default=2)
    p.add_argument("--alpha",           type=float, default=0.0)
    p.add_argument("--beta",            type=float, default=0.0)
    p.add_argument("--num_simulations", type=int,   default=1)
    p.add_argument("--algorithm",       type=str,   default="EPOS")
    args = p.parse_args()

    log_path = os.path.join(args.output_dir, "algorithm_log.txt")
    experiments = []

    if os.path.exists(log_path):
        run_data, _ = parse_algorithm_log(log_path)
        runs = sorted(list(run_data.keys())) if run_data else [0]
        print(f"Parsed algorithm_log.txt: found runs {runs}")
        for r in runs:
            iterations = iterations_from_log(run_data, r)
            edges      = edges_from_log(run_data, r, args.num_agents, args.num_children)
            global_responses = read_global_responses(args.output_dir, len(iterations), run_idx=r)
            
            experiment = {
                "id": "{n}_agents_{p}_plans_{a}_{b}{t}_sim_{s}".format(
                    n=args.num_agents, p=args.num_plans, a=args.alpha, b=args.beta,
                    t="_ternary" if args.num_children == 3 else "",
                    s=r + 1
                ),
                "config": {
                    "numAgents":      args.num_agents,
                    "numPlans":       args.num_plans,
                    "numSimulations": r + 1,
                    "numIterations":  args.num_iterations,
                    "numChildren":    args.num_children,
                    "alpha":          args.alpha,
                    "beta":           args.beta,
                    "dataset":        "uploaded",
                    "algorithm":      args.algorithm,
                },
                "edges":           edges,
                "iterations":      iterations,
                "keyIterations":   detect_key_iterations(iterations),
                "globalResponses": global_responses,
            }
            experiments.append(experiment)
    else:
        # Fallback: use selected-plans.csv + cost CSVs
        selected_plans_path = os.path.join(args.output_dir, "selected-plans.csv")
        runs = [0]
        if os.path.exists(selected_plans_path):
            try:
                with open(selected_plans_path, newline='', encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    runs = sorted(list(set(int(row['Run']) for row in reader if 'Run' in row)))
            except Exception:
                runs = [0]
        if not runs:
            runs = [0]

        print(f"Fallback CSV parse: found runs {runs}")
        for r in runs:
            iterations = iterations_from_csvs(
                os.path.join(args.output_dir, "selected-plans.csv"),
                os.path.join(args.output_dir, "local-cost.csv"),
                os.path.join(args.output_dir, "global-complex-cost.csv"),
                run_idx=r
            )
            edges = edges_from_bfs(args.num_agents, args.num_children)
            global_responses = read_global_responses(args.output_dir, len(iterations), run_idx=r)

            experiment = {
                "id": "{n}_agents_{p}_plans_{a}_{b}{t}_sim_{s}".format(
                    n=args.num_agents, p=args.num_plans, a=args.alpha, b=args.beta,
                    t="_ternary" if args.num_children == 3 else "",
                    s=r + 1
                ),
                "config": {
                    "numAgents":      args.num_agents,
                    "numPlans":       args.num_plans,
                    "numSimulations": r + 1,
                    "numIterations":  args.num_iterations,
                    "numChildren":    args.num_children,
                    "alpha":          args.alpha,
                    "beta":           args.beta,
                    "dataset":        "uploaded",
                    "algorithm":      args.algorithm,
                },
                "edges":           edges,
                "iterations":      iterations,
                "keyIterations":   detect_key_iterations(iterations),
                "globalResponses": global_responses,
            }
            experiments.append(experiment)

    out_path = os.path.join(args.output_dir, "experiments.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"experiments": experiments}, f)

    print(f"VIZ_DATA: {out_path}")


if __name__ == "__main__":
    main()
