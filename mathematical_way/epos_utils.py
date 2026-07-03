import numpy as np

def run_single_simulation(start_combo, agent_names, agents, num_plans, max_iterations):
    """
    Runs a single EPOS simulation for a given starting combination of plans.
    Designed to be picklable for multiprocessing.
    """
    # 1. Initialization
    current_plans = {name: start_combo[i] for i, name in enumerate(agent_names)}
    
    # Calculate Initial Global Sum
    vecs = [agents[name][idx]['vec'] for name, idx in current_plans.items()]
    current_global_sum = np.sum(vecs, axis=0)
    
    # --- Track local costs per iteration ---
    iteration_costs_history = []
    # Record Iteration 0 (Initial State)
    iter_costs = {name: agents[name][idx]['cost'] for name, idx in current_plans.items()}
    iteration_costs_history.append(iter_costs)
    
    # 2. Main Optimization Loop
    for iteration_num in range(1, max_iterations + 1):
        changes = 0
        
        # Iterate over agents
        for name in agent_names:
            curr_idx = current_plans[name]
            curr_vec = agents[name][curr_idx]['vec']
            
            partial_sum = current_global_sum - curr_vec
            
            best_idx = curr_idx
            best_var = np.var(current_global_sum)
            
            # Evaluate alternatives
            for p_idx in range(num_plans):
                if p_idx == curr_idx: continue
                
                cand_vec = agents[name][p_idx]['vec']
                pot_sum = partial_sum + cand_vec
                pot_var = np.var(pot_sum)
                
                # Greedy Selection (Variance only)
                if pot_var < best_var: 
                    best_var = pot_var
                    best_idx = p_idx
            
            if best_idx != curr_idx:
                current_plans[name] = best_idx
                current_global_sum = partial_sum + agents[name][best_idx]['vec']
                changes += 1
        
        # Record costs at end of this iteration
        iter_costs = {name: agents[name][idx]['cost'] for name, idx in current_plans.items()}
        iteration_costs_history.append(iter_costs)

        if changes == 0:
            break

    # Calculate final stats
    final_indices = tuple(current_plans.values())
    final_vecs = [agents[name][idx]['vec'] for name, idx in current_plans.items()]
    final_costs = [agents[name][idx]['cost'] for name, idx in current_plans.items()]
    
    final_gc = np.var(np.sum(final_vecs, axis=0))
    final_lc = sum(final_costs) / len(agent_names)
    
    return {
        "Start_Indices": str(start_combo),
        "Final_Indices": str(final_indices),
        "Final_GC": round(final_gc, 6),
        "Final_LC": round(final_lc, 4),
        "Iteration_Costs": iteration_costs_history
    }
