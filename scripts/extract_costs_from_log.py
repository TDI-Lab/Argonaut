import re
import pandas as pd
import argparse
import os
import sys

def parse_log(log_path):
    # Maps for current context
    # (Run, Agent, Iter, Plan) -> (Local, Global)
    plan_costs = {} 
    
    # Regexes
    re_sim = re.compile(r'=== Simulation (\d+) ===')
    re_plan_calc = re.compile(r'\[Plan Cost Calculation\] Agent (\d+) \(Iter (\d+)\)')
    re_candidate = re.compile(r'\[Candidate Plan (\d+)\]')
    re_global_cost = re.compile(r'=> Global Cost = ([\d\.]+)')
    re_local_cost = re.compile(r'=> Local Cost = ([\d\.]+)')
    
    re_selection = re.compile(r'\[Plan Selection Optimization\] Agent (\d+) \(Iter (\d+)\)')
    re_selected = re.compile(r'=> Selected Plan (\d+) with Min Cost')
    
    # State variables
    current_run = 0 # Default to 0 if no Simulation header found initially
    current_agent = None
    current_iter = None
    current_candidate = None
    
    # Storage for selected plans
    # (Run, Iter) -> {Agent: Cost}
    selected_local_map = {}
    selected_complex_map = {}

    print(f"Reading log file: {log_path}")
    try:
        with open(log_path, 'r', encoding='utf-8', errors='replace') as f:
            for line in f:
                line = line.strip()
                if not line: continue
                
                # Simulation / Run
                m_sim = re_sim.search(line)
                if m_sim:
                    # Simulation 1 -> Run 0
                    current_run = int(m_sim.group(1)) - 1
                    print(f"Found Simulation {m_sim.group(1)} (Run {current_run})")
                    # We don't wipe plan_costs because multiple agents run in the same sim
                    continue
                
                # Plan Cost Calculation Header
                m_calc = re_plan_calc.search(line)
                if m_calc:
                    current_agent = int(m_calc.group(1))
                    current_iter = int(m_calc.group(2))
                    current_candidate = None
                    continue
                    
                # Candidate Plan
                m_cand = re_candidate.search(line)
                if m_cand:
                    current_candidate = int(m_cand.group(1))
                    continue
                
                # Costs inside Candidate Plan
                if current_candidate is not None and current_agent is not None:
                    m_g = re_global_cost.search(line)
                    if m_g:
                        g_cost = float(m_g.group(1))
                        key = (current_run, current_agent, current_iter, current_candidate)
                        if key not in plan_costs: plan_costs[key] = {}
                        plan_costs[key]['global'] = g_cost
                    
                    m_l = re_local_cost.search(line)
                    if m_l:
                        l_cost = float(m_l.group(1))
                        key = (current_run, current_agent, current_iter, current_candidate)
                        if key not in plan_costs: plan_costs[key] = {}
                        plan_costs[key]['local'] = l_cost
                
                # Plan Selection Header
                m_sel_header = re_selection.search(line)
                if m_sel_header:
                    current_agent = int(m_sel_header.group(1))
                    current_iter = int(m_sel_header.group(2))
                    continue
                    
                # Selected Plan Line
                # "| => Selected Plan 3 with Min Cost 0.7590"
                if '=> Selected Plan' in line:
                    m_final = re_selected.search(line)
                    if m_final and current_agent is not None and current_iter is not None:
                        sel_plan = int(m_final.group(1))
                        
                        # Retrieve calculated costs
                        key = (current_run, current_agent, current_iter, sel_plan)
                        costs = plan_costs.get(key, {})
                        
                        lc = costs.get('local', None)
                        gc = costs.get('global', None)
                        
                        if lc is not None:
                            if (current_run, current_iter) not in selected_local_map:
                                selected_local_map[(current_run, current_iter)] = {}
                            selected_local_map[(current_run, current_iter)][current_agent] = lc
                            
                        if gc is not None:
                            if (current_run, current_iter) not in selected_complex_map:
                                selected_complex_map[(current_run, current_iter)] = {}
                            selected_complex_map[(current_run, current_iter)][current_agent] = gc
                            
    except Exception as e:
        print(f"Error reading log: {e}")
        sys.exit(1)

    print(f"Extracted {len(selected_local_map)} iterations of data.")
    return selected_local_map, selected_complex_map

def write_csv(data_map, output_path):
    rows = []
    for (run, iter_val), agent_map in data_map.items():
        row = {'Run': run, 'Iteration': iter_val}
        for ag, cost in agent_map.items():
            row[f'agent-{ag}'] = cost
        rows.append(row)
    
    if not rows:
        print(f"No data to write for {output_path}")
        return

    df = pd.DataFrame(rows)
    # Sort
    df = df.sort_values(['Run', 'Iteration'])
    
    # Ensure columns have a nice order: Run, Iteration, agent-0, agent-1...
    agents = [c for c in df.columns if c.startswith('agent-')]
    def agent_sort_key(c):
        try:
            return int(c.split('-')[1])
        except:
            return 999999
            
    agents.sort(key=agent_sort_key)
    cols = ['Run', 'Iteration'] + agents
    df = df[cols]
    
    df.to_csv(output_path, index=False)
    print(f"Wrote {output_path}")

def main():
    parser = argparse.ArgumentParser()
    # Make log_file optional or smarter
    parser.add_argument('target_dir', help='Output directory for CSV files (and location to search for log)')
    parser.add_argument('--log', help='Explicit path to algorithm_log.txt', default=None)
    args = parser.parse_args()

    # Determine Log Path
    log_path = args.log
    
    # 1. Check if provided explicitly
    if log_path and not os.path.exists(log_path):
        print(f"Error: Provided log path {log_path} does not exist.")
        sys.exit(1)
        
    # 2. Check inside target_dir
    if not log_path:
        candidate = os.path.join(args.target_dir, 'algorithm_log.txt')
        if os.path.exists(candidate):
            log_path = candidate
            
    # 3. Check workspace root (assuming script is in scripts/ and root is one level up?) 
    # Actually context suggests scripts/ is in root. log is in root.
    if not log_path:
        # Heuristic: ../algorithm_log.txt relative to script location? 
        # Or Just 'algorithm_log.txt' in CWD.
        if os.path.exists('algorithm_log.txt'):
             log_path = 'algorithm_log.txt'
             
    if not log_path or not os.path.exists(log_path):
        print("Error: Could not find algorithm_log.txt in target dir or current dir. Please specify with --log.")
        sys.exit(1)

    if not os.path.exists(args.target_dir):
        os.makedirs(args.target_dir)

    l_map, c_map = parse_log(log_path)
    
    write_csv(l_map, os.path.join(args.target_dir, 'local-cost-per-agent.csv'))
    write_csv(c_map, os.path.join(args.target_dir, 'complex-cost-per-agent.csv'))

if __name__ == '__main__':
    main()
