import re
import argparse
import os
import sys
import subprocess
import matplotlib.pyplot as plt
import networkx as nx
import pandas as pd

def parse_log_for_topology(log_path):
    # Data structure:
    # run_data[run_id][iter_id] = {
    #    'edges': [(child, parent), ...],
    #    'roles': {agent_id: role_string},
    #    'selected_plans': {agent_id: plan_id},
    #    'local_costs': {agent_id: cost},
    #    'global_costs': {agent_id: cost},
    # }
    run_data = {}
    
    current_run = 0
    current_iter_phase = None
    current_agent_phase = None
    
    # State for Optimization Block
    opt_agent = None
    opt_iter = None
    opt_cost_map = {} # {plan_id: global_cost}
    
    # State for Cost Calculation Block
    calc_agent = None
    calc_iter = None
    calc_plan = None
    cost_cache = {} # (run, iter, agent, plan) -> gcost
    
    # Regexes
    re_sim = re.compile(r'=== Simulation (\d+) ===')
    
    # [Plan Selection Optimization] Agent 0 (Iter 0)
    re_opt_header = re.compile(r'\[Plan Selection Optimization\] Agent (\d+) \(Iter (\d+)\)')
    #   Plan 0: GlobalCost=0.8202
    re_plan_global = re.compile(r'\s+Plan (\d+): GlobalCost=([\d\.]+)')
    # => Selected Plan 3 with Min Cost 0.7590
    re_selected_opt = re.compile(r'=> Selected Plan (\d+) with Min Cost')

    # [Plan Cost Calculation] Agent 0 (Iter 0)
    re_calc_header = re.compile(r'\[Plan Cost Calculation\] Agent (\d+) \(Iter (\d+)\)')
    #    [Candidate Plan 0]
    re_cand_plan = re.compile(r'\s+\[Candidate Plan (\d+)\]')
    #       => Global Cost = 0.8202
    re_cand_gcost = re.compile(r'\s+=> Global Cost = ([\d\.]+)')

    # [Iter 0] [BOTTOM-UP PHASE] Agent 0:
    re_iter_phase = re.compile(r'\[Iter (\d+)\] \[BOTTOM-UP PHASE\] Agent (\d+):')
    
    # - I am a LEAF node (no children).
    # - I am an INNER node.
    re_role = re.compile(r'- I am an? ([A-Z]+) node')
    re_root = re.compile(r'- I am the ROOT')
    
    # - Sending aggregated proposal to Parent (Agent 5).
    re_parent = re.compile(r'- Sending aggregated proposal to Parent \(Agent (\d+)\)')
    
    # - I selected Plan ID: 3 (Cost: 3.0000)
    re_plan_id = re.compile(r'- I selected Plan ID: (\d+) \(Cost: ([\d\.]+)\)')

    print(f"Reading {log_path}...")
    
    with open(log_path, 'r', encoding='utf-8', errors='replace') as f:
        for line in f:
            line = line.strip()
            if not line: continue
            
            # Simulation
            m_sim = re_sim.search(line)
            if m_sim:
                current_run = int(m_sim.group(1)) - 1
                continue
            
            # --- Cost Calculation Block Parsing ---
            m_calc = re_calc_header.search(line)
            if m_calc:
                calc_agent = int(m_calc.group(1))
                calc_iter = int(m_calc.group(2))
                calc_plan = None
                continue
            
            if calc_agent is not None:
                # Inside Cost Calc Block
                m_cp = re_cand_plan.search(line)
                if m_cp:
                    calc_plan = int(m_cp.group(1))
                    continue
                
                m_cgc = re_cand_gcost.search(line)
                if m_cgc and calc_plan is not None:
                    gcost = float(m_cgc.group(1))
                    cost_cache[(current_run, calc_iter, calc_agent, calc_plan)] = gcost
                    continue

                if line.startswith('[') and 'Candidate Plan' not in line:
                    # New block started, reset
                    calc_agent = None
            
            # --- Optimization Block Parsing ---
            m_opt = re_opt_header.search(line)
            if m_opt:
                opt_agent = int(m_opt.group(1))
                opt_iter = int(m_opt.group(2))
                opt_cost_map = {}
                continue
                
            if opt_agent is not None:
                # We are inside an optimization block
                # Check for Plan Global Cost
                m_pg = re_plan_global.search(line)
                if m_pg:
                    try:
                        pid = int(m_pg.group(1))
                        gcost = float(m_pg.group(2))
                        opt_cost_map[pid] = gcost
                    except ValueError:
                        pass
                
                # Check for Selection
                m_sel = re_selected_opt.search(line)
                if m_sel:
                    try:
                        selected_pid = int(m_sel.group(1))
                        gcost = opt_cost_map.get(selected_pid, 0.0)
                        
                        # Store Global Cost
                        if current_run not in run_data: run_data[current_run] = {}
                        if opt_iter not in run_data[current_run]:
                            run_data[current_run][opt_iter] = {
                                'edges': [], 'roles': {}, 'selected_plans': {},
                                'local_costs': {}, 'global_costs': {}
                            }
                        
                        run_data[current_run][opt_iter]['global_costs'][opt_agent] = gcost
                    except (ValueError, KeyError):
                        pass
                    
                    # Reset opt state
                    opt_agent = None
                    opt_cost_map = {}
                    continue

            # --- Bottom-Up Phase Parsing ---
            m_iter = re_iter_phase.search(line)
            if m_iter:
                current_iter_phase = int(m_iter.group(1))
                current_agent_phase = int(m_iter.group(2))
                
                # Reset opt state just in case
                opt_agent = None 
                calc_agent = None
                
                if current_run not in run_data: run_data[current_run] = {}
                if current_iter_phase not in run_data[current_run]:
                     run_data[current_run][current_iter_phase] = {
                         'edges': [], 'roles': {}, 'selected_plans': {},
                         'local_costs': {}, 'global_costs': {}
                     }
                continue
            
            if current_agent_phase is not None and current_iter_phase is not None:
                if current_run not in run_data or current_iter_phase not in run_data[current_run]:
                    continue

                iter_data = run_data[current_run][current_iter_phase]
                
                # Role
                m_r = re_role.search(line)
                if m_r:
                    iter_data['roles'][current_agent_phase] = m_r.group(1)
                elif re_root.search(line):
                    iter_data['roles'][current_agent_phase] = 'ROOT'
                    
                # Selected Plan (Local Cost & ID)
                m_p = re_plan_id.search(line)
                if m_p:
                    pid = int(m_p.group(1))
                    lcost = float(m_p.group(2))
                    iter_data['selected_plans'][current_agent_phase] = pid
                    iter_data['local_costs'][current_agent_phase] = lcost
                    
                    # Try to populate CC from cost_cache
                    cc = cost_cache.get((current_run, current_iter_phase, current_agent_phase, pid))
                    if cc is not None:
                        iter_data['global_costs'][current_agent_phase] = cc
                    
                # Parent Edge
                m_par = re_parent.search(line)
                if m_par:
                    parent_id = int(m_par.group(1))
                    iter_data['edges'].append((current_agent_phase, parent_id))
                    
    return run_data

def hierarchy_pos(G, root=None, width=1., vert_gap = 0.2, vert_loc = 0, xcenter = 0.5):
    '''
    From Joel's answer at https://stackoverflow.com/a/29597209/2966723.  
    '''
    return _hierarchy_pos(G, root, width, vert_gap, vert_loc, xcenter)

def _hierarchy_pos(G, root, width=1., vert_gap = 0.2, vert_loc = 0, xcenter = 0.5, pos = None, parent = None):
    if pos is None:
        pos = {root:(xcenter,vert_loc)}
    else:
        pos[root] = (xcenter, vert_loc)
        
    children = list(G.neighbors(root))
    if not isinstance(G, nx.DiGraph) and parent is not None:
        children.remove(parent)  
        
    if len(children)!=0:
        dx = width/len(children) 
        nextx = xcenter - width/2 - dx/2
        for child in children:
            nextx += dx
            pos = _hierarchy_pos(G,child, width = dx, vert_gap = vert_gap, 
                                vert_loc = vert_loc-vert_gap, xcenter=nextx,
                                pos=pos, parent = root)
    return pos

def visualize_run_iteration(run_id, iter_id, data, output_dir, prev_data=None):
    edges = data['edges']
    node_plans = data['selected_plans']
    node_lcosts = data['local_costs']
    node_gcosts = data.get('global_costs', {})
    roles = data['roles']
    
    # Build Graph (Edges are Child -> Parent)
    G = nx.DiGraph()
    
    all_agents = set()
    for u, v in edges:
        all_agents.add(u)
        all_agents.add(v)
    for a in node_plans:
        all_agents.add(a)

    if not all_agents:
        # print(f"No agents found for Run {run_id} Iter {iter_id}")
        return

    G.add_nodes_from(all_agents)
    G.add_edges_from(edges)
    
    # Root identification (Out-degree 0 in Child->Parent graph)
    roots = [n for n, d in G.out_degree() if d == 0]
    real_root = roots[0] if roots else None

    # Tree Structure for Layout (Parent -> Child)
    R = G.reverse()
    
    try:
        if real_root is not None:
            pos = hierarchy_pos(R, root=real_root)
        else:
             pos = nx.spring_layout(G)
    except Exception:
        pos = nx.spring_layout(G)
    
    # Aesthetics
    plt.figure(figsize=(16, 12), facecolor='#eeeeee')
    ax = plt.gca()
    ax.set_facecolor('#eeeeee')
    
    # Draw Edges (Arrows)
    # Child->Parent flow
    nx.draw_networkx_edges(G, pos, arrowstyle='-|>', arrowsize=20, edge_color='#666666', width=1.5, node_size=2000)
    
    # Node Colors based on PLAN ID
    # Colors matching the heatmap palette (Paired)
    plan_colors = [
        '#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', 
        '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a', '#ffff99'
    ]
    
    node_colors = []
    for n in G.nodes():
        pid = node_plans.get(n)
        if pid is not None:
            c = plan_colors[pid % len(plan_colors)]
        else:
            c = '#eeeeee' # Grey for unknown
        node_colors.append(c)
            
    nx.draw_networkx_nodes(G, pos, node_size=3000, node_color=node_colors, edgecolors='#555555', linewidths=1.5)
    
    # Labels (Agent ID)
    nx.draw_networkx_labels(G, pos, font_size=12, font_weight='bold', font_color='#ffffff')
    
    # Cost Change Arrows (Iter > 0)
    if prev_data:
        prev_lcosts = prev_data['local_costs']
        for n, (x, y) in pos.items():
            curr_lc = node_lcosts.get(n, 0.0)
            prev_lc = prev_lcosts.get(n, 0.0)
            diff = curr_lc - prev_lc
            
            # Use a small epsilon for float comparison
            if abs(diff) > 1e-6:
                if diff < 0:
                    # Cost Decreased -> Green Down Arrow
                    marker = "↓"
                    color = "#008000" # Darker green
                else: 
                    # Cost Increased -> Red Up Arrow
                    marker = "↑"
                    color = "#cc0000" # Standard red
                
                # Plot beside the node
                # Centered vertically (va='center') and slightly to the right (x + offset)
                ax.text(x + 0.04, y, marker, color=color, fontsize=18, fontweight='bold', zorder=20, ha='left', va='center')

    # Helper for node info
    def get_info(aid):
        p = node_plans.get(aid, '?')
        l = node_lcosts.get(aid, 0.0)
        c = node_gcosts.get(aid, None)
        return p, l, c

    # Annotations (Boxes with Tables)
    for n, (x, y) in pos.items():
        pid, lc, cc = get_info(n)
        
        # Determine children (from Reverse graph Parent->Child)
        children = []
        if n in R:
            children = sorted(list(R.neighbors(n)))
            
        num_children = len(children)
        is_leaf = (num_children == 0)
        
        # Build Label Content
        lines = []
        
        # Header Info
        lines.append(f"Plan: {pid}")
        lines.append(f"LC: {lc:.4f}")
        
        if cc is not None:
            lines.append(f"CC: {cc:.4f}")
        
        # Table of Children info for Non-Leaf nodes
        if not is_leaf:
            lines.append("-" * 28)
            lines.append(f"{'ChID':<5} {'Plan':<5} {'LC':<6} {'CC':<6}")
            lines.append("-" * 28)
            
            # Show all children (or truncate if too many)
            display_children = children
            truncated = False
            if len(children) > 8:
                display_children = children[:8]
                truncated = True
                
            for child in display_children:
                c_pid, c_lc, c_cc = get_info(child)
                cc_str = f"{c_cc:.2f}" if c_cc is not None else "??"
                lines.append(f"{child:<5} {c_pid:<5} {c_lc:<6.2f} {cc_str:<6}")
            
            if truncated:
                lines.append(f"... +{len(children)-8} more")

        label_text = "\n".join(lines)
        
        # Y-offset for text box (move it below the node)
        # Height depends on number of lines
        box_y_offset = 0.08 + (0.015 * len(lines))
        
        ax.text(
            x, y - 0.06, 
            label_text, 
            bbox=dict(boxstyle="round,pad=0.3", fc="#e6e6fa", ec="#b0b0d0", alpha=0.95),
            ha='center', va='top', fontsize=7, family='monospace', color='#333333'
        )
        
    plt.title(f"Simulation {run_id+1} - Iteration {iter_id}\nEPOS Structure (Color: Selected Plan)", fontsize=16, fontweight='bold', pad=15)
    
    # Global Cost Box (Top of Root)
    if real_root is not None:
        root_gc = node_gcosts.get(real_root)
        if root_gc is not None:
            # Determine Arrow
            arrow_txt = ""
            arrow_col = "black"
            
            if prev_data:
                prev_gc = prev_data.get('global_costs', {}).get(real_root)
                if prev_gc is not None:
                    diff = root_gc - prev_gc
                    if abs(diff) > 1e-6:
                        if diff < 0:
                            arrow_txt = "↓"
                            arrow_col = "#008000"
                        else:
                            arrow_txt = "↑"
                            arrow_col = "#cc0000"
            
            rx, ry = pos[real_root]
            
            # Draw Box
            # Positioned to the LEFT of the root node to avoid conflict with LC arrow on right
            box_text = f"Global Cost: {root_gc:.4f}"
            
            # Same aesthetic as other boxes (lavender), bold text, monospace
            ax.text(rx - 0.08, ry, box_text, 
                    bbox=dict(boxstyle="round,pad=0.3", fc="#e6e6fa", ec="#b0b0d0", alpha=0.95),
                    ha='right', va='center', fontsize=10, fontweight='bold', family='monospace', color='#333333', zorder=25)
            
            # Draw Arrow to the LEFT of the box
            if arrow_txt:
                ax.text(rx - 0.22, ry, arrow_txt, 
                        color=arrow_col, fontsize=18, fontweight='bold', ha='right', va='center', zorder=25)

    # Legend for Plans
    import matplotlib.patches as mpatches
    used_plans = sorted(list(set([p for p in node_plans.values() if p is not None])))
    patches = []
    
    # Add Plan patches
    for p in used_plans:
        c = plan_colors[p % len(plan_colors)]
        patches.append(mpatches.Patch(color=c, label=f'Plan {p}'))
        
    if patches:
        plt.legend(handles=patches, loc='upper right', title="Selected Plans", fontsize=8)
    
    plt.axis('off')
    
    out_file = os.path.join(output_dir, f"tree_run{run_id}_iter{iter_id:04d}.png")
    plt.tight_layout()
    plt.savefig(out_file, dpi=150)
    plt.close()
    
def create_video(run_id, image_files, output_dir):
    """
    Stitches images into an MP4 video using ffmpeg.
    """
    if not image_files:
        return

    # Check for ffmpeg
    try:
        subprocess.check_call(['ffmpeg', '-version'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("Warning: ffmpeg not found. Skipping video generation.")
        return

    video_name = f"video_run{run_id}.mp4"
    video_path = os.path.join(output_dir, video_name)
    list_path = os.path.join(output_dir, f"ffmpeg_list_run{run_id}.txt")
    
    print(f"Creating video {video_name} from {len(image_files)} images...")
    
    # Create file list for ffmpeg
    # Duration for each frame (e.g. 1 second per iteration)
    duration = 1.0
    with open(list_path, 'w') as f:
        for img_path in image_files:
            f.write(f"file '{os.path.basename(img_path)}'\n")
            f.write(f"duration {duration}\n")
        # Repeat last frame to see the final state
        if image_files:
             f.write(f"file '{os.path.basename(image_files[-1])}'\n")

    # Run ffmpeg
    # -safe 0 allows absolute paths (though here we use relative and cd or relative paths in list)
    # Actually if list has basename, we should run ffmpeg from output_dir
    cmd = [
        'ffmpeg', '-y', 
        '-f', 'concat', 
        '-safe', '0', 
        '-i', os.path.basename(list_path), 
        '-vsync', 'vfr', 
        '-pix_fmt', 'yuv420p', 
        video_name
    ]
    
    try:
        subprocess.check_call(cmd, cwd=output_dir, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
        print(f"Video created: {video_path}")
    except subprocess.CalledProcessError as e:
        print(f"Error creating video: {e}")
    finally:
        # Cleanup list file
        if os.path.exists(list_path):
            os.remove(list_path)

def main():
    parser = argparse.ArgumentParser(description='Visualize Tree Topology + Costs')
    parser.add_argument('input_dir', help='Path to output folder containing generated CSVs and logs')
    args = parser.parse_args()
    
    # Log assumption: input_dir/../algorithm_log.txt or input_dir/algorithm_log.txt?
    # Context says log is at root of workspace, extracted CSVs in output/gaussian_...
    # We will search for algorithm_log.txt in:
    # 1. input_dir (unlikely based on structure)
    # 2. current directory
    # 3. Two levels up from input_dir if input_dir is like output/run_123
    
    # Prioritize log file inside the input directory (as per recent changes)
    log_path = os.path.join(args.input_dir, 'algorithm_log.txt')
    
    if not os.path.exists(log_path):
        candidates = [
            'algorithm_log.txt',
            os.path.join(os.path.dirname(os.path.dirname(args.input_dir)), 'algorithm_log.txt'),
            '/Users/digantamandal/Desktop/EPOS/EPOSsrc/algorithm_log.txt'
        ]
        
        found = False
        for c in candidates:
            if os.path.exists(c):
                print(f"Warning: algorithm_log.txt not found in {args.input_dir}. Falling back to {c}")
                log_path = c
                found = True
                break
                
        if not found:
            print(f"Error: Could not find algorithm_log.txt in {args.input_dir} or standard fallback locations.")
            sys.exit(1)
        
    runs = parse_log_for_topology(log_path)
    
    output_subdir = os.path.join(args.input_dir, 'tree_visualizations')
    os.makedirs(output_subdir, exist_ok=True)
    
    # Cleanup old PNGs/MP4s to avoid duplicates (e.g. iter1.png vs iter0001.png)
    print("Cleaning up old visualization files...")
    for f in os.listdir(output_subdir):
        if (f.endswith(".png") and f.startswith("tree_run")) or (f.endswith(".mp4") and f.startswith("video_run")):
             try:
                os.remove(os.path.join(output_subdir, f))
             except OSError:
                pass
    
    count = 0
    for run_id, run_data in runs.items():
        sorted_iters = sorted(run_data.keys())
        print(f"Generating images for Run {run_id} ({len(sorted_iters)} iterations)...")
        
        prev_data = None
        created_files = []
        for iter_id in sorted_iters:
            visualize_run_iteration(run_id, iter_id, run_data[iter_id], output_subdir, prev_data=prev_data)
            
            # The filename format must match exactly what visualize_run_iteration produces
            # Note: I changed standard naming to include :04d padding in visualize_run_iteration in previous step
            fname = f"tree_run{run_id}_iter{iter_id:04d}.png"
            created_files.append(os.path.join(output_subdir, fname))
            
            prev_data = run_data[iter_id]
            count += 1
            
        # Create video for this run
        create_video(run_id, created_files, output_subdir)
            
    print(f"Done. Generated {count} images and videos in {output_subdir}")

if __name__ == '__main__':
    main()
