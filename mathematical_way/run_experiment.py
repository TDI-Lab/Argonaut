import argparse
import subprocess
import os
import sys
import datetime
import glob
import re
import json
import csv as csvmod
import signal

child_proc = None


def convert_plans_to_csv(dataset_folder, num_plans, output_file):
    """Convert agent_*.plans files to semicolon-separated CSV for code.ipynb."""
    plan_files = sorted(
        glob.glob(os.path.join(dataset_folder, "agent_*.plans")),
        key=lambda p: int(m.group(1)) if (m := re.search(r'agent_(\d+)\.plans', os.path.basename(p))) else 0
    )

    if not plan_files:
        print(f"Error: No agent_*.plans files found in {dataset_folder}")
        sys.exit(1)

    rows = []
    for file_path in plan_files:
        filename = os.path.basename(file_path)
        m = re.search(r'agent_(\d+)\.plans', filename)
        agent_id = m.group(1) if m else filename

        with open(file_path, 'r') as f:
            lines = [l.strip() for l in f if l.strip()]

        selected = lines[:num_plans]
        if len(selected) < num_plans:
            print(f"  Warning: {filename} has only {len(selected)} plans, using all available.")

        row_parts = [agent_id]
        for idx, line in enumerate(selected):
            parts = line.split(':', 1)
            vector_str = parts[1].strip() if len(parts) >= 2 else line
            cost = idx + 1  # 1-based index as cost
            row_parts.append(f"{cost}:{vector_str}")
        rows.append(row_parts)

    num_plan_cols = max((len(r) - 1 for r in rows), default=num_plans)
    header = ['voter_id'] + [f'plan_{i+1}' for i in range(num_plan_cols)]

    with open(output_file, 'w') as f:
        f.write(';'.join(header) + '\n')
        for row in rows:
            while len(row) - 1 < num_plan_cols:
                row.append('')
            f.write(';'.join(row) + '\n')

    print(f"  Converted {len(rows)} agents, up to {num_plan_cols} plans -> {output_file}")
    return len(rows)


def generate_summary(output_dir):
    """Generate summary.json from notebook output CSVs."""
    summary = {}

    bf_path = os.path.join(output_dir, 'solutionwiseresults.csv')
    if os.path.exists(bf_path):
        with open(bf_path, 'r') as f:
            rows = list(csvmod.DictReader(f))
        if rows:
            gcs = [float(r['GC']) for r in rows]
            lcs = [float(r['LC']) for r in rows]
            best_row = min(rows, key=lambda r: float(r['GC']))
            summary.update({
                'total_combinations': len(rows),
                'best_gc': float(best_row['GC']),
                'best_lc': float(best_row['LC']),
                'best_combo_label': str(best_row['Indices']),
                'best_combo_indices': str(best_row['Indices']),
                'mean_gc': sum(gcs) / len(gcs),
                'min_lc': min(lcs),
                'max_lc': max(lcs),
            })

    sim_path = os.path.join(output_dir, 'epossimulationresults.csv')
    if os.path.exists(sim_path):
        with open(sim_path, 'r') as f:
            rows = list(csvmod.DictReader(f))
        if rows:
            try:
                indices = rows[0]['Final_Indices'].strip('()').split(',')
                summary['n_agents'] = len(indices)
            except Exception:
                pass
            hits = sum(1 for r in rows if str(r.get('Hit_Global_Optimum', '')).lower() == 'true')
            summary['success_rate'] = round(hits / len(rows) * 100, 2) if rows else 0

    out_path = os.path.join(output_dir, 'summary.json')
    killed_flag_path = os.path.join(output_dir, 'killed.txt')
    if os.path.exists(killed_flag_path):
        summary['killed'] = True
        try:
            os.remove(killed_flag_path)
        except Exception:
            pass
    with open(out_path, 'w') as f:
        json.dump(summary, f, indent=2)
    print(f"  Generated {out_path}")


def main():
    parser = argparse.ArgumentParser(description="Automated EPOS Experiment Runner")
    parser.add_argument("--agents", type=int, default=5, help="Number of agents")
    parser.add_argument("--plans", "--plan", type=int, default=3, dest="plans",
                        help="Number of plans per agent")
    parser.add_argument("--selection", type=str, default="top",
                        choices=["top", "bottom", "random",
                                 "quantile_25", "quantile_50", "quantile_75"],
                        help="Plan selection strategy (only used without --dataset_folder)")
    parser.add_argument("--dataset_folder", type=str, default=None,
                        help="Path to folder with agent_*.plans files. "
                             "Skips generate_csv_from_gaussian.py when provided.")
    parser.add_argument("--output_folder", type=str, default=None,
                        help="Path to output folder where results should be written.")
    args = parser.parse_args()

    sel_short = args.selection.replace("quantile_", "q")
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")

    if args.output_folder:
        output_folder = args.output_folder
    else:
        if args.dataset_folder:
            output_folder = f"{args.agents}_agent_{args.plans}_plan_uploaded_{timestamp}"
        else:
            output_folder = f"{args.agents}_agent_{args.plans}_{sel_short}_{timestamp}"

    if args.dataset_folder:
        dataset_folder = os.path.abspath(args.dataset_folder)
        if not os.path.isdir(dataset_folder):
            print(f"Error: dataset_folder '{dataset_folder}' does not exist.")
            sys.exit(1)
        input_file = f"input_uploaded_{args.plans}_{timestamp}.csv"
        print(f"--- [1/2] Converting uploaded dataset: {dataset_folder} ---")
        actual = convert_plans_to_csv(dataset_folder, args.plans, input_file)
        if actual != args.agents:
            print(f"  Note: found {actual} agent files (--agents was {args.agents}), using {actual}")
    else:
        input_file = f"input_{args.agents}_{args.plans}_{sel_short}.csv"
        print(f"--- [1/2] Generating Data: {args.agents} agents, {args.plans} plans, {args.selection} ---")
        try:
            subprocess.check_call([
                sys.executable, "generate_csv_from_gaussian.py",
                "--agents", str(args.agents),
                "--plans", str(args.plans),
                "--selection", args.selection,
                "--output", input_file,
            ])
        except subprocess.CalledProcessError as e:
            print(f"Error generating data: {e}")
            sys.exit(1)

    print(f"\n--- [2/2] Running Simulation (Input: {input_file}) ---")
    print(f"    Output Folder: {output_folder}")

    env = os.environ.copy()
    env['EPOS_INPUT_FILE'] = input_file
    env['EPOS_OUTPUT_FOLDER'] = output_folder
    env['EPOS_OUTPUT_SUFFIX'] = f"_{sel_short}"

    # Signal forwarding setup
    def handle_signal_forward(signum, frame):
        global child_proc
        print(f"run_experiment.py received signal {signum}. Forwarding to child process...")
        if child_proc:
            try:
                child_proc.terminate()
            except Exception as e:
                print(f"Error terminating child process: {e}")

    signal.signal(signal.SIGTERM, handle_signal_forward)
    signal.signal(signal.SIGINT, handle_signal_forward)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    code_script = os.path.join(script_dir, "code.py")
    try:
        global child_proc
        child_proc = subprocess.Popen([sys.executable, code_script], env=env)
        exit_code = child_proc.wait()
        if exit_code != 0:
            print(f"\nSimulation exited with code: {exit_code}")
    except Exception as e:
        print(f"\nError running simulation: {e}")
        sys.exit(1)

    abs_output = os.path.abspath(output_folder)
    generate_summary(abs_output)

    # Generate brute-force visualizations (non-fatal if matplotlib unavailable)
    viz_script = os.path.join(script_dir, "brute_force_visualizer.py")
    if os.path.exists(viz_script):
        try:
            subprocess.check_call([sys.executable, viz_script, abs_output])
            print("Brute-force visualizations generated.")
        except Exception as e:
            print(f"Warning: visualization generation failed (non-fatal): {e}")

    print(f"\nExperiment Completed Successfully!")
    print(f"OUTPUT_DIR: {abs_output}")


if __name__ == "__main__":
    main()
