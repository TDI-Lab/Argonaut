#!/usr/bin/env python3
import re
import argparse
import os
import sys
import matplotlib.pyplot as plt
import networkx as nx
import pandas as pd
import numpy as np
from matplotlib.patches import Circle, Rectangle
from matplotlib import cm
from matplotlib.colors import LinearSegmentedColormap, Normalize

# --- Configuration ---
COLORS_RED    = ['#ffffb2', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#b10026']
COLORS_PURPLE = ['#fcfbfd', '#efedf5', '#dadaeb', '#bcbddc', '#9e9ac8', '#807dba', '#6a51a3', '#4a1486']

def get_text_color_for_bg(rgba_color):
    """
    Determine if text should be white or black based on background color luminance.
    Input: RGBA tuple or hex string
    Returns: 'white' for dark backgrounds, 'black' for light backgrounds
    """
    # Convert RGBA tuple to RGB
    if isinstance(rgba_color, (tuple, list)) and len(rgba_color) >= 3:
        r, g, b = rgba_color[0], rgba_color[1], rgba_color[2]
    else:
        return 'black'  # Default fallback
    
    # Calculate relative luminance (WCAG formula)
    # Convert from 0-1 to proper linear scale
    def adjust_channel(c):
        if c <= 0.03928:
            return c / 12.92
        else:
            return ((c + 0.055) / 1.055) ** 2.4
    
    r_lin = adjust_channel(r)
    g_lin = adjust_channel(g)
    b_lin = adjust_channel(b)
    
    luminance = 0.2126 * r_lin + 0.7152 * g_lin + 0.0722 * b_lin
    
    # Use white text for dark colors (luminance < 0.5)
    return 'white' if luminance < 0.5 else 'black'

def parse_log_for_topology(log_path):
    # Same logic as visualize_tree.py
    run_data = {}
    
    current_run = 0
    current_iter_phase = None
    current_agent_phase = None
    
    calc_agent = None
    calc_iter = None
    calc_plan = None
    cost_cache = {} # (run, iter, agent, plan) -> complex_cost (global cost contribution)
    
    re_sim = re.compile(r'=== Simulation (\d+) ===')
    re_calc_header = re.compile(r'\[Plan Cost Calculation\] Agent (\d+) \(Iter (\d+)\)')
    re_cand_plan = re.compile(r'\s+\[Candidate Plan (\d+)\]')
    re_cand_gcost = re.compile(r'\s+=> Global Cost = ([\d\.]+)')
    re_iter_phase = re.compile(r'\[Iter (\d+)\] \[BOTTOM-UP PHASE\] Agent (\d+):')
    re_parent = re.compile(r'- Sending aggregated proposal to Parent \(Agent (\d+)\)')
    re_plan_id = re.compile(r'- I selected Plan ID: (\d+) \(Cost: ([\d\.]+)\)')

    if not os.path.exists(log_path):
        return {}

    with open(log_path, 'r', encoding='utf-8', errors='replace') as f:
        for line in f:
            line = line.strip()
            if not line: continue
            
            m_sim = re_sim.search(line)
            if m_sim:
                current_run = int(m_sim.group(1)) - 1
                continue
            
            # Cost Calc
            m_calc = re_calc_header.search(line)
            if m_calc:
                calc_agent = int(m_calc.group(1))
                calc_iter = int(m_calc.group(2))
                calc_plan = None
                continue
            
            if calc_agent is not None:
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
                    calc_agent = None
            
            # Bottom Up
            m_iter = re_iter_phase.search(line)
            if m_iter:
                current_iter_phase = int(m_iter.group(1))
                current_agent_phase = int(m_iter.group(2))
                
                if current_run not in run_data: run_data[current_run] = {}
                if current_iter_phase not in run_data[current_run]:
                     run_data[current_run][current_iter_phase] = {
                         'edges': [], 'selected_plans': {},
                         'local_costs': {}, 'complex_costs': {}
                     }
                continue
            
            if current_agent_phase is not None and current_iter_phase is not None:
                # Plan & Local Cost
                m_p = re_plan_id.search(line)
                if m_p:
                    pid = int(m_p.group(1))
                    lcost = float(m_p.group(2))
                    
                    iter_d = run_data[current_run][current_iter_phase]
                    iter_d['selected_plans'][current_agent_phase] = pid
                    iter_d['local_costs'][current_agent_phase] = lcost
                    
                    cc = cost_cache.get((current_run, current_iter_phase, current_agent_phase, pid))
                    if cc is not None:
                        iter_d['complex_costs'][current_agent_phase] = cc
                
                # Edge
                m_par = re_parent.search(line)
                if m_par:
                    parent_id = int(m_par.group(1))
                    run_data[current_run][current_iter_phase]['edges'].append((current_agent_phase, parent_id))
                    
    return run_data

def get_radial_pos(G, root, node_radius=0.3):
    """
    Generate a circular radial tree layout with NO edge crossings.
    Root at center. Each subtree gets a contiguous angular wedge.
    All nodes at same depth are on the same circle (same radius).
    """
    from collections import deque
    
    # BFS to get parent relationships and levels
    parent_map = {root: None}
    levels = {root: 0}
    queue = deque([root])
    
    while queue:
        node = queue.popleft()
        for neighbor in G.neighbors(node):
            if neighbor not in levels:
                levels[neighbor] = levels[node] + 1
                parent_map[neighbor] = node
                queue.append(neighbor)
    
    # Group nodes by level
    level_nodes = {}
    for node, level in levels.items():
        if level not in level_nodes:
            level_nodes[level] = []
        level_nodes[level].append(node)
    
    # Count leaves in each subtree (for proportional angle allocation)
    def count_leaves(node):
        children = [n for n in G.neighbors(node) if parent_map.get(n) == node]
        if not children:
            return 1
        return sum(count_leaves(c) for c in children)
    
    leaf_counts = {node: count_leaves(node) for node in G.nodes()}
    total_leaves = leaf_counts[root]
    
    # Get max depth
    max_depth = max(levels.values()) if levels else 1
    
    # Calculate radius for each level
    # To make it look circular, use fixed radius increments
    # but ensure outer levels have enough space for all nodes
    
    # Find the level with the most nodes
    max_nodes_at_level = max(len(nodes) for nodes in level_nodes.values())
    
    # Minimum spacing between nodes on same circle
    min_arc_spacing = node_radius * 4
    
    # Required radius for the most crowded level
    min_radius_for_crowded = max_nodes_at_level * min_arc_spacing / (2 * np.pi)
    
    # Fixed radius increment - ensures nice concentric circles
    base_radius = max(min_radius_for_crowded / max_depth, node_radius * 5)
    
    pos = {}
    
    def assign_positions(node, angle_start, angle_end, depth):
        # Place this node at the middle of its angular range
        if depth == 0:
            pos[node] = np.array([0.0, 0.0])
        else:
            mid_angle = (angle_start + angle_end) / 2
            # Fixed radius per level - creates perfect circles
            r = depth * base_radius
            x = r * np.cos(mid_angle)
            y = r * np.sin(mid_angle)
            pos[node] = np.array([x, y])
        
        # Get children (nodes whose parent is this node)
        children = [n for n in G.neighbors(node) if parent_map.get(n) == node]
        if not children:
            return
        
        # Sort children by their ID for consistency
        children.sort()
        
        # Distribute angular range proportionally by leaf count
        total_child_leaves = sum(leaf_counts[c] for c in children)
        angle_range = angle_end - angle_start
        current_angle = angle_start
        
        for child in children:
            child_leaves = leaf_counts[child]
            child_angle_range = angle_range * child_leaves / total_child_leaves
            assign_positions(child, current_angle, current_angle + child_angle_range, depth + 1)
            current_angle += child_angle_range
    
    # Start from root, full circle
    assign_positions(root, 0, 2 * np.pi, 0)
    
    return pos

def create_visualization(run_dir, run_idx, output_folder, color_mode='local_cost'):
    log_path = os.path.join(run_dir, 'algorithm_log.txt')
    run_data = parse_log_for_topology(log_path)
    
    if run_idx not in run_data:
        print(f"Run {run_idx} not found in log parsing results (or log missing).")
        print("The algorithm_log.txt file is required for tree topology.")
        return
        
    iters = sorted(run_data[run_idx].keys())
    
    # Read Global Cost CSV for the slider/bar
    gc_df = None
    gc_path = os.path.join(run_dir, 'global-cost.csv')
    if os.path.exists(gc_path):
        gc_df = pd.read_csv(gc_path)
    
    # Determine Global Min/Max Local Cost for Coloring consistency
    all_lcosts = []
    for it in iters:
        all_lcosts.extend(run_data[run_idx][it]['local_costs'].values())
    
    min_lc = min(all_lcosts) if all_lcosts else 0
    max_lc = max(all_lcosts) if all_lcosts else 1

    # Determine Global Min/Max Complex Cost
    all_ccosts = []
    for it in iters:
        all_ccosts.extend(run_data[run_idx][it]['complex_costs'].values())
    
    min_cc = min(all_ccosts) if all_ccosts else 0
    max_cc = max(all_ccosts) if all_ccosts else 1
    
    # Collect all global costs for slider display
    all_global_costs = {}  # iteration -> global_cost
    if gc_df is not None:
        col = f'Run-{run_idx}'
        if col in gc_df.columns:
            for _, row in gc_df.iterrows():
                all_global_costs[int(row['Iteration'])] = row[col]
    
    # Get unique global cost values for slider ticks
    gc_values = sorted(set(all_global_costs.values()))
    
    # Setup Colormap based on color_mode
    if color_mode == 'complex_cost':
        cmap = LinearSegmentedColormap.from_list("custom_purple", COLORS_PURPLE, N=256)
        norm = Normalize(vmin=min_cc, vmax=max_cc)
    else:  # local_cost
        cmap = LinearSegmentedColormap.from_list("custom_red", COLORS_RED, N=256)
        norm = Normalize(vmin=min_lc, vmax=max_lc)
    
    os.makedirs(output_folder, exist_ok=True)
    
    prev_plans = {} # agent -> plan
    
    for i, it in enumerate(iters):
        print(f"Generating Iteration {it}...")
        
        data = run_data[run_idx][it]
        edges = data['edges'] # Child->Parent
        
        # Build Graph (Parent->Child for layout)
        G = nx.DiGraph()
        
        # Add all nodes found in plans or edges
        nodes = set(data['selected_plans'].keys())
        for u, v in edges:
            nodes.add(u)
            nodes.add(v)
            G.add_edge(v, u) # Reverse edge direction for Parent->Child layout
            
        # Ensure all nodes in graph
        G.add_nodes_from(nodes)
        
        # Determine Root
        # In Parent->Child graph, root has in-degree 0
        roots = [n for n, d in G.in_degree() if d == 0]
        root = roots[0] if roots else (list(nodes)[0] if nodes else 0)
        
        # --- PLOTTING: SEPARATE FILES ---
        n_agents = len(nodes)
        
        # Node radius scales with agent count - smaller for more agents
        node_radius = max(0.15, min(0.4, 8.0 / n_agents))
        
        # Font size - scales with node radius
        font_size = max(7, min(12, int(node_radius * 30)))
        
        # Layout with proper spacing
        pos = get_radial_pos(G, root, node_radius=node_radius)
        
        # Calculate figure size based on layout extent
        all_x = [pos[n][0] for n in pos]
        all_y = [pos[n][1] for n in pos]
        extent = max(max(all_x) - min(all_x), max(all_y) - min(all_y)) if all_x else 10
        fig_size = max(12, extent * 1.2)
        
        # Get current global cost
        curr_gc = all_global_costs.get(it, 0.0)
        
        # Prepare table data first (needed for sizing)
        complex_costs = data.get('complex_costs', {})
        sorted_agents = sorted(list(nodes))
        
        table_data = []
        for ag in sorted_agents:
            pid = data['selected_plans'].get(ag, '-')
            cc = complex_costs.get(ag, 0.0)
            cc_str = f"{cc:.4f}" if isinstance(cc, float) else str(cc)
            table_data.append([ag, pid, cc_str])
        
        # Split table into multiple columns if too many rows
        max_rows_per_table = 32
        n_table_cols = max(1, (len(table_data) + max_rows_per_table - 1) // max_rows_per_table)
        n_table_cols = min(n_table_cols, 2)  # Max 2 table columns
        
        # Split table_data into chunks
        rows_per_chunk = (len(table_data) + n_table_cols - 1) // n_table_cols
        table_chunks = []
        for i in range(n_table_cols):
            start_idx = i * rows_per_chunk
            end_idx = min((i + 1) * rows_per_chunk, len(table_data))
            if start_idx < len(table_data):
                table_chunks.append(table_data[start_idx:end_idx])
        
        # Combined figure: Tree (left) + Tables (right), Slider at bottom
        table_width_ratio = 0.35 * n_table_cols
        total_width = fig_size * (1 + table_width_ratio)
        
        fig = plt.figure(figsize=(total_width, fig_size + 2), facecolor='white')
        
        # Create gridspec: tree on left, n_table_cols tables on right
        width_ratios = [1] + [0.35] * n_table_cols
        gs = fig.add_gridspec(2, 1 + n_table_cols, width_ratios=width_ratios, height_ratios=[10, 1], 
                              hspace=0.1, wspace=0.02)
        
        # Tree subplot (top-left)
        ax_tree = fig.add_subplot(gs[0, 0])
        ax_tree.set_aspect('equal')
        ax_tree.axis('off')
        
        # Draw Edges first
        nx.draw_networkx_edges(G, pos, ax=ax_tree, arrowstyle='-', edge_color='#888888', alpha=0.5, width=1.5)
        
        # Draw Nodes
        node_ids = list(G.nodes())
        
        node_colors = []
        edge_styles = []
        b_widths = []
        
        for n in node_ids:
            # Color based on selected mode
            if color_mode == 'complex_cost':
                val = data['complex_costs'].get(n, min_cc)
            else:
                val = data['local_costs'].get(n, min_lc)
            node_colors.append(cmap(norm(val)))
            
            # Border Style
            pid = data['selected_plans'].get(n)
            prev_pid = prev_plans.get(n)
            
            if prev_pid is not None and pid == prev_pid:
                edge_styles.append((0, (5, 5)))  # Dashed
                b_widths.append(1.5)
            else:
                edge_styles.append('solid')
                b_widths.append(2.5)
        
        for idx, n in enumerate(node_ids):
            # Double border for root node: draw outer ring first (behind)
            if n == root:
                outer_circle = Circle(pos[n], radius=node_radius * 1.45, facecolor='none',
                                      edgecolor='black', linestyle='solid', linewidth=2.5, zorder=9)
                ax_tree.add_patch(outer_circle)

            circle = Circle(pos[n], radius=node_radius, facecolor=node_colors[idx], 
                            edgecolor='black', linestyle=edge_styles[idx], 
                            linewidth=b_widths[idx], zorder=10)
            ax_tree.add_patch(circle)
            
            # Determine text color based on node color luminance
            text_color = get_text_color_for_bg(node_colors[idx])
            
            ax_tree.text(pos[n][0], pos[n][1], str(n), ha='center', va='center', 
                         fontsize=font_size, weight='bold', zorder=11, color=text_color)

        ax_tree.autoscale_view()
        xlim = ax_tree.get_xlim()
        ylim = ax_tree.get_ylim()
        margin = node_radius * 2
        ax_tree.set_xlim(xlim[0]-margin, xlim[1]+margin)
        ax_tree.set_ylim(ylim[0]-margin, ylim[1]+margin)
        
        # Add title
        color_label = 'Complex Cost' if color_mode == 'complex_cost' else 'Local Cost'
        ax_tree.set_title(f"Iteration {it} | Global Cost: {curr_gc:.4f} | Color: {color_label}", fontsize=14, weight='bold', pad=20)
        
        # TABLES (multiple columns side by side)
        col_labels = ["Agent", "Plan", "Complex Cost"]
        
        for tbl_idx, chunk in enumerate(table_chunks):
            ax_table = fig.add_subplot(gs[0, 1 + tbl_idx])
            ax_table.axis('off')
            
            if chunk:
                the_table = ax_table.table(
                    cellText=chunk, 
                    colLabels=col_labels, 
                    loc='upper center', 
                    cellLoc='center',
                    colColours=['#4472C4', '#4472C4', '#4472C4'],
                    colWidths=[0.25, 0.25, 0.5]
                )
                
                the_table.auto_set_font_size(False)
                the_table.set_fontsize(8)
                the_table.scale(1, 1.2)
                
                # Style header and cells
                for key, cell in the_table.get_celld().items():
                    row, col = key
                    if row == 0:
                        cell.set_text_props(weight='bold', color='white')
                        cell.set_facecolor('#4472C4')
                    else:
                        if row % 2 == 0:
                            cell.set_facecolor('#D9E2F3')
                        else:
                            cell.set_facecolor('#FFFFFF')
                        cell.set_text_props(color='black')
                    cell.set_edgecolor('#8EA9DB')
        
        # SLIDER at bottom (spans all columns)
        ax_slider = fig.add_subplot(gs[1, :])
        ax_slider.axis('off')
        
        if gc_values:
            ax_slider.set_xlim(-0.5, len(gc_values) - 0.5)
            ax_slider.set_ylim(0, 1)
            ax_slider.plot([0, len(gc_values)-1], [0.5, 0.5], color='#cccccc', linewidth=6, zorder=1)
            
            for idx_gc, gc_val in enumerate(gc_values):
                is_current = abs(gc_val - curr_gc) < 1e-6
                
                marker_color = '#b10026' if is_current else '#888888'
                marker_size = 18 if is_current else 10
                ax_slider.plot(idx_gc, 0.5, 'o', color=marker_color, markersize=marker_size, zorder=3)
                
                font_weight = 'bold' if is_current else 'normal'
                font_size_slider = 12 if is_current else 9
                font_color = 'black' if is_current else '#666666'
                ax_slider.text(idx_gc, 0.1, f"{gc_val:.2f}", ha='center', va='top', 
                               fontsize=font_size_slider, weight=font_weight, color=font_color)
            
            ax_slider.text((len(gc_values)-1)/2, 0.9, "Global Cost", ha='center', va='bottom', 
                          fontsize=12, weight='bold', color='black')
        
        tree_file = os.path.join(output_folder, f"tree_{color_mode}_iter_{it:03d}.png")
        fig.savefig(tree_file, dpi=150, bbox_inches='tight')
        plt.close(fig)
        
        # Update prev plans
        for n in node_ids:
            pid = data['selected_plans'].get(n)
            if pid is not None:
                prev_plans[n] = pid
        
        print(f"  -> {tree_file}")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('run_dir', help="Path to run output folder")
    parser.add_argument('--run', type=int, default=0)
    parser.add_argument('--color', choices=['local_cost', 'complex_cost'], default='local_cost',
                        help="Color nodes by: local_cost (red scale) or complex_cost (purple scale)")
    args = parser.parse_args()
    
    out_folder = os.path.join(args.run_dir, 'radial_visualizations')
    create_visualization(args.run_dir, args.run, out_folder, color_mode=args.color)
    print(f"Done. Visualizations saved to {out_folder}")

if __name__ == "__main__":
    main()
