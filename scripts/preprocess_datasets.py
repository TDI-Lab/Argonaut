"""
Preprocess dataset folders into single JSON files for fast loading.
Runs once during Docker build. For each folder containing .plans files,
writes a dataset.json with all agents pre-parsed.
"""
import os, json, sys, re

def natural_sort_key(name):
    nums = re.findall(r'\d+', name)
    return int(nums[0]) if nums else name

def process_folder(folder_path):
    plans_files = sorted(
        [f for f in os.listdir(folder_path) if f.endswith('.plans')],
        key=natural_sort_key
    )
    if not plans_files:
        return None

    agents = []
    for fname in plans_files:
        name = fname.replace('.plans', '')
        plans = []
        with open(os.path.join(folder_path, fname), 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                parts = line.split(':', 1)
                if len(parts) < 2:
                    continue
                try:
                    cost = float(parts[0])
                    values = [float(v) for v in parts[1].split(',')]
                    plans.append({"cost": cost, "values": values})
                except ValueError:
                    continue
        agents.append({"name": name, "plans": plans})
    return agents

def scan_and_preprocess(base_dir):
    count = 0
    for root, dirs, files in os.walk(base_dir):
        dirs[:] = [d for d in dirs if d != '__MACOSX']
        has_plans = any(f.endswith('.plans') for f in files)
        if has_plans:
            print(f"  Processing: {root} ...", end=' ', flush=True)
            agents = process_folder(root)
            if agents:
                out_path = os.path.join(root, 'dataset.json')
                with open(out_path, 'w', encoding='utf-8') as f:
                    json.dump(agents, f)
                size_mb = os.path.getsize(out_path) / (1024 * 1024)
                print(f"{len(agents)} agents, {size_mb:.1f} MB")
                count += 1
            else:
                print("skipped (no valid plans)")
    return count

if __name__ == '__main__':
    base = sys.argv[1] if len(sys.argv) > 1 else 'datasets'
    if not os.path.isdir(base):
        print(f"Directory not found: {base}")
        sys.exit(1)
    print(f"Preprocessing datasets in {base}...")
    n = scan_and_preprocess(base)
    print(f"Done. Preprocessed {n} dataset(s).")
