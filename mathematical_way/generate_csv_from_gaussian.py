import os
import pandas as pd
import argparse
import random
import glob
import re

def main():
    parser = argparse.ArgumentParser(description="Generate EPOS input CSV from Gaussian dataset.")
    parser.add_argument("--agents", type=int, default=10, help="Number of agents to select")
    parser.add_argument("--plans", type=int, default=3, help="Number of plans per agent")
    parser.add_argument("--source", type=str, default="gaussian", help="Directory containing agent_*.plans files")
    parser.add_argument("--output", type=str, help="Output CSV filename. Defaults to input_{agents}_{plans}.csv")
    parser.add_argument("--selection", type=str, default="top", 
                        choices=["top", "bottom", "random", "quantile_25", "quantile_50", "quantile_75"],
                        help="Plan selection strategy: top (default), bottom, random, or quantile_XX")
    
    args = parser.parse_args()
    
    NUM_AGENTS = args.agents
    NUM_PLANS = args.plans
    SOURCE_DIR = args.source
    
    if args.output:
        OUTPUT_FILE = args.output
    else:
        OUTPUT_FILE = f"input_{NUM_AGENTS}_{NUM_PLANS}.csv"

    if not os.path.exists(SOURCE_DIR):
        print(f"Error: Source directory '{SOURCE_DIR}' not found.")
        return

    # Find all agent files
    all_files = glob.glob(os.path.join(SOURCE_DIR, "agent_*.plans"))
    if len(all_files) < NUM_AGENTS:
        print(f"Error: Found only {len(all_files)} agents in {SOURCE_DIR}, but requested {NUM_AGENTS}.")
        return

    # Randomly select agents
    selected_files = random.sample(all_files, NUM_AGENTS)
    selected_files.sort() # Sort for consistent looking output if needed, though they are random

    data = []

    print(f"Selecting {NUM_AGENTS} agents from {len(all_files)} available files...")
    print(f"Plan Selection Strategy: {args.selection}")

    for file_path in selected_files:
        # Extract Agent ID from filename
        filename = os.path.basename(file_path)
        # Assuming filename format is agent_123.plans, we extract '123'
        match = re.search(r'agent_(\d+)\.plans', filename)
        if match:
             agent_id = match.group(1)
        else:
             agent_id = filename # Fallback
        
        with open(file_path, 'r') as f:
            all_lines = [line.strip() for line in f.readlines() if line.strip()]
        
        if len(all_lines) < NUM_PLANS:
            print(f"Warning: {filename} has only {len(all_lines)} plans. Skipping.")
            continue

        # --- Selection Strategy ---
        indices = list(range(len(all_lines)))
        selected_lines_with_cost = [] # Tuple (cost, vector_str)

        if args.selection == "top":
            # Pick first K (Index 0 to K-1)
            selected_indices = indices[:NUM_PLANS]
        
        elif args.selection == "bottom":
            # Pick last K
            selected_indices = indices[-NUM_PLANS:]
        
        elif args.selection == "random":
            selected_indices = random.sample(indices, NUM_PLANS)
            # Sort indices to maintain relative order if desired, or keep random?
            # Keeping sorted usually makes sense for reading, but random implies no order
            # Let's keep them as sampled
        
        elif args.selection.startswith("quantile_"):
            percentile = int(args.selection.split("_")[1])
            start_index = int((percentile / 100.0) * len(all_lines))
            # Adjust if we overshoot the end
            if start_index + NUM_PLANS > len(all_lines):
                start_index = len(all_lines) - NUM_PLANS
            selected_indices = indices[start_index : start_index + NUM_PLANS]
        else:
            # Fallback
            selected_indices = indices[:NUM_PLANS]

        # Extract vectors and assign costs (Cost = Index + 1)
        for idx in selected_indices:
            line = all_lines[idx]
            original_cost = idx + 1 # Cost is 1-based index
            
            # Parse vector
            parts = line.split(':')
            if len(parts) < 2:
                 if ',' in line:
                     vector_str = line
                 else:
                     print(f"Error parsing line for {filename}: {line}")
                     continue
            else:
                vector_str = parts[1].strip()
            
            selected_lines_with_cost.append((original_cost, vector_str))

        row = {'voter_id': agent_id}
        for p, (cost, vec_str) in enumerate(selected_lines_with_cost):
            # Format: "COST:VECTOR"
            row[f'plan_{p+1}'] = f"{cost}:{vec_str}"
        
        data.append(row)

    if not data:
        print("No valid data found.")
        return

    df = pd.DataFrame(data)
    # Reorder columns to ensure plan_1, plan_2, ...
    cols = ['voter_id'] + [f'plan_{p+1}' for p in range(NUM_PLANS)]
    df = df[cols]

    # Save to CSV with semicolon separator to match notebook format
    df.to_csv(OUTPUT_FILE, sep=';', index=False)
    print(f"Successfully generated {OUTPUT_FILE} with {len(df)} agents and {NUM_PLANS} plans.")

if __name__ == "__main__":
    main()
