#!/usr/bin/env python3
"""
brute_force_visualizer.py

Generates concentric circle PNGs for every starting combination (state),
using local cost color coding for each agent.
Reads iteration_cost_history.csv and epossimulationresults.csv.

Output structure:
  <run_dir>/radial_visualisation_new/
    tree_local_cost_iter_0000.png
    tree_local_cost_iter_0001.png
    ...
"""
import re
import argparse
import os
import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
from matplotlib.patches import Circle
from matplotlib.colors import LinearSegmentedColormap, Normalize

# --- Configuration ---
COLORS_RED = ['#ffffb2', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#b10026']


def get_text_color_for_bg(rgba_color):
    """Return 'white' or 'black' for readable text on the given background."""
    if isinstance(rgba_color, (tuple, list)) and len(rgba_color) >= 3:
        r, g, b = rgba_color[0], rgba_color[1], rgba_color[2]
    else:
        return 'black'

    def lin(c):
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    return 'white' if luminance < 0.5 else 'black'


def get_concentric_pos(node_ids, base_radius=1.5):
    """
    Arranges nodes in concentric circles around (0,0).
    The central node is labeled 'Global Calculation'.
    Each subsequent circle holds increasing powers of 2 agents: 1, 2, 4, 8...
    """
    pos = {}
    
    # Sort node_ids to place them deterministically
    rem = sorted(list(node_ids))
    c = 0
    radii = []
    while rem:
        cap = 2 ** c
        chunk = rem[:cap]
        rem = rem[cap:]
        
        r = (c + 1) * base_radius
        radii.append(r)
        for i, nd in enumerate(chunk):
            if len(chunk) == 1:
                angle = np.pi / 2  # Place single agent at the top
            else:
                angle = i * (2 * np.pi / len(chunk))
            pos[nd] = np.array([r * np.cos(angle), r * np.sin(angle)])
        c += 1
        
    return pos, radii


def render_tree(ax, pos, radii, node_ids, node_colors, node_radius, font_size, title_text):
    """Draw concentric nodes on ax."""
    ax.set_aspect('equal')
    ax.axis('off')

    # Draw the dashed concentric circles (orbits)
    for r in radii:
        orbit = Circle(
            (0, 0), radius=r,
            facecolor='none', edgecolor='#666666',
            linestyle='dashed', linewidth=1.2, zorder=5
        )
        ax.add_patch(orbit)

    for idx, n in enumerate(node_ids):
        border_color = 'white'

        circle = Circle(
            pos[n], radius=node_radius,
            facecolor=node_colors[idx],
            edgecolor=border_color,
            linewidth=2.5, zorder=10,
        )
        ax.add_patch(circle)

        text_color = get_text_color_for_bg(node_colors[idx])
        ax.text(
            pos[n][0], pos[n][1], str(n),
            ha='center', va='center',
            fontsize=font_size, weight='bold',
            color=text_color, zorder=11,
        )

    ax.autoscale_view()
    xlim = ax.get_xlim()
    ylim = ax.get_ylim()
    margin = node_radius * 2
    ax.set_xlim(xlim[0] - margin, xlim[1] + margin)
    ax.set_ylim(ylim[0] - margin, ylim[1] + margin)
    ax.set_title(title_text, fontsize=14, weight='bold', pad=20, color='white')


def create_visualization(run_dir, output_folder):
    history_path = os.path.join(run_dir, 'iteration_cost_history.csv')
    if not os.path.exists(history_path):
        print(f"Error: {history_path} not found.")
        return

    df = pd.read_csv(history_path)
    
    results_path = os.path.join(run_dir, 'solutionwiseresults.csv')
    df_res = None
    min_final_gc = None
    if os.path.exists(results_path):
        df_res = pd.read_csv(results_path)
        if 'GC' in df_res.columns:
            min_final_gc = df_res['GC'].min()

    # Columns are "Agent 0", "Agent 1", ...
    agent_cols = [c for c in df.columns if c not in ('Start_State', 'Iteration')]
    num_agents = len(agent_cols)

    # Map each column to its integer agent id
    col_to_id = {}
    for col in agent_cols:
        m = re.search(r'\d+', col)
        col_to_id[col] = int(m.group()) if m else agent_cols.index(col)

    unique_states = df['Start_State'].unique()

    # Colour normalisation across all configurations
    min_lc = df[agent_cols].min().min()
    max_lc = df[agent_cols].max().max()
    cmap_lc = LinearSegmentedColormap.from_list('custom_red', COLORS_RED, N=256)
    norm_lc = Normalize(vmin=min_lc, vmax=max_lc)

    node_ids = sorted(list(col_to_id.values()))
    node_radius = max(0.15, min(0.4, 8.0 / num_agents))
    font_size = max(7, min(12, int(node_radius * 30)))

    pos, radii = get_concentric_pos(node_ids, base_radius=node_radius * 4)

    all_x = [p[0] for p in pos.values()]
    all_y = [p[1] for p in pos.values()]
    extent = max(max(all_x) - min(all_x), max(all_y) - min(all_y)) if all_x else 10
    fig_size = max(12, extent * 1.2)

    os.makedirs(output_folder, exist_ok=True)

    fig_bg = (13 / 255, 15 / 255, 26 / 255, 0.96)
    fig = plt.figure(figsize=(fig_size, fig_size), facecolor=fig_bg)
    ax_tree = fig.add_subplot(1, 1, 1)

    for idx, first_state in enumerate(unique_states):
        # We want the initial configuration cost, which is at Iteration == 1
        df_state = df[(df['Start_State'] == first_state) & (df['Iteration'] == 1)]
        if df_state.empty:
            continue
        row = df_state.iloc[0]

        curr_gc = 0.0
        is_best = False
        if df_res is not None and 'GC' in df_res.columns and 'Indices' in df_res.columns:
            match_rows = df_res[df_res['Indices'] == first_state]
            if not match_rows.empty:
                curr_gc = match_rows['GC'].iloc[0]
                if min_final_gc is not None and np.isclose(curr_gc, min_final_gc):
                    is_best = True

        node_colors_lc = []
        for n in node_ids:
            col_name = next(c for c, aid in col_to_id.items() if aid == n)
            val = row[col_name]
            node_colors_lc.append(cmap_lc(norm_lc(val)))

        ax_tree.clear()
        ax_tree.set_facecolor(fig_bg[:3])

        title_suffix = " [Best/Optimum]" if is_best else ""
        render_tree(
            ax_tree, pos, radii, node_ids, node_colors_lc,
            node_radius, font_size,
            f"Solution Space: {first_state} | Global Cost: {curr_gc:.4f}{title_suffix}",
        )

        # Output sequential names so sorting works properly
        out_file = os.path.join(output_folder, f"tree_local_cost_iter_{idx:04d}.png")
        fig.savefig(out_file, dpi=150, bbox_inches='tight', facecolor=fig_bg)
        print(f"Generated ({idx+1}/{len(unique_states)}): {out_file}")

    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(
        description="Generate concentric circle PNGs for every combination"
    )
    parser.add_argument('run_dir', help="Path to run output folder (must contain iteration_cost_history.csv)")
    parser.add_argument('--state', type=int, default=1, help="Ignored, kept for backward compatibility.")
    args = parser.parse_args()

    out_folder = os.path.join(args.run_dir, 'radial_visualisation_new')
    create_visualization(args.run_dir, out_folder)
    print(f"Done. Visualizations saved to {out_folder}")


if __name__ == '__main__':
    main()
