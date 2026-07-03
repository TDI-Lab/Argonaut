#!/usr/bin/env python3
"""
Generate two heatmaps of agents (x) vs iterations (y).

1. Color by Plan ID:
   - Annotation: Local Cost & Complex Cost.
2. Color by Local Cost:
   - Annotation: Plan ID & Complex Cost.

"""
import argparse
import os
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from matplotlib.colors import LinearSegmentedColormap

def read_used_conf(run_dir):
    conf_file = os.path.join(run_dir, 'used_conf.txt')
    alpha = beta = None
    local_cost_func = None
    num_plans = None
    if os.path.exists(conf_file):
        with open(conf_file) as f:
            for line in f:
                if line.strip().startswith('alpha'):
                    try:
                        alpha = float(line.split('=')[1].strip())
                    except Exception:
                        pass
                if line.strip().startswith('beta'):
                    try:
                        beta = float(line.split('=')[1].strip())
                    except Exception:
                        pass
                if line.strip().startswith('local cost function'):
                    try:
                        local_cost_func = line.split('=')[1].strip()
                    except Exception:
                        pass
                if line.strip().startswith('numPlans'):
                    try:
                        num_plans = int(line.split('=')[1].strip())
                    except Exception:
                        pass
    return alpha, beta, local_cost_func, num_plans


def read_run_series_from_file(path, run_idx):
    if not os.path.exists(path):
        return None
    try:
        df = pd.read_csv(path)
        col_name = f'Run-{run_idx}'
        if col_name in df.columns and 'Iteration' in df.columns:
            return df.set_index('Iteration')[col_name]
    except Exception as e:
        print(f"Warning: could not read {path}: {e}")
    return None

def read_per_agent_matrix_from_file(path, run_idx):
    if not os.path.exists(path):
        print(f"File not found: {path}")
        return None
    try:
        df = pd.read_csv(path)
        if 'Run' in df.columns:
            df = df[df['Run'] == run_idx]
        if df.empty:
            print(f"No data for run {run_idx} in {path}")
            return None
        df = df.sort_values('Iteration')
        agents = [c for c in df.columns if c.startswith('agent-')]
        
        # Sort agent columns by number to ensure they iterate 0..N
        def sort_key(s):
             try: return int(s.split('-')[1])
             except: return -1
        agents.sort(key=sort_key)
        
        print(f"Read {path} for Run {run_idx}, shape {df[agents].shape}")
        
        # Create a Series of dictionaries or just a DataFrame indexed by Iteration
        df = df.set_index('Iteration')
        return df[agents]
    except Exception as e:
        print(f"Warning: could not read {path}: {e}")
    return None

def read_global_costs(run_dir, run_idx=0):
    return read_run_series_from_file(os.path.join(run_dir, 'global-cost.csv'), run_idx)

def read_aggregated_metrics(run_dir, run_idx=0):
    local_path = os.path.join(run_dir, 'local-cost-per-agent.csv')
    complex_path = os.path.join(run_dir, 'complex-cost-per-agent.csv')
    
    local_df = read_per_agent_matrix_from_file(local_path, run_idx)
    complex_df = read_per_agent_matrix_from_file(complex_path, run_idx)
    
    return local_df, complex_df


def read_selected_plans(run_dir, run_idx=0):
    path = os.path.join(run_dir, 'selected-plans.csv')
    df = pd.read_csv(path)
    df = df[df['Run'] == run_idx]
    df = df.sort_values('Iteration')
    agents = [c for c in df.columns if c.startswith('agent-')]
    mat = df[agents].to_numpy()
    iterations = df['Iteration'].to_numpy()
    agent_names = agents
    return mat, iterations, agent_names

def get_aligned_matrix(iterations, df, shape):
    # Convert dataframe to aligned float matrix matching plan_mat layout
    # shape = (nrows, ncols)
    mat = np.full(shape, np.nan)
    nrows, ncols = shape
    
    if df is None: return mat
    
    for i in range(nrows):
        current_iter = iterations[i]
        if current_iter in df.index:
            try:
                row_vals = df.loc[current_iter].values # Assuming sorted cols
                if len(row_vals) == ncols:
                    mat[i, :] = row_vals.astype(float)
            except Exception:
                pass
    return mat

def build_annotation_matrix(plan_mat, iterations, local_df=None, complex_df=None, style='default'):
    nrows, ncols = plan_mat.shape
    ann = np.empty(plan_mat.shape, dtype=object)
    
    for i in range(nrows):
        current_iter = iterations[i]
        for j in range(ncols):
            parts = []
            
            plan_id = int(plan_mat[i,j])
            
            l_val = None
            if local_df is not None and current_iter in local_df.index:
                 try: l_val = local_df.loc[current_iter].iloc[j]
                 except: pass
            
            c_val = None
            if complex_df is not None and current_iter in complex_df.index:
                 try: c_val = complex_df.loc[current_iter].iloc[j]
                 except: pass
            
            if style == 'pid_color':
                # Color by Plan ID -> Annotation: LC & CC
                if l_val is not None: parts.append(f"LC:{l_val:.2f}")
                if c_val is not None: parts.append(f"CC:{c_val:.2f}")
                if not parts: parts.append("-")
            
            elif style == 'lc_color':
                # Color by Local Cost -> Annotation: PlanID & CC
                # Plan ID number only
                parts.append(f"{plan_id}")
                if c_val is not None: parts.append(f"CC:{c_val:.2f}")
            
            else:
                parts.append(f"Plan ID:{plan_id}")
                if l_val is not None: parts.append(f"LC:{l_val:.2f}")
                if c_val is not None: parts.append(f"CC:{c_val:.2f}")
            
            ann[i,j] = '\n'.join(parts)
    return ann

def plot_single_heatmap(run_dir, out_filename, data, annot_mat, iterations, agents, 
                        cmap, vmin, vmax, title, global_series, custom_fmt=False):
    
    n_agents = data.shape[1]
    n_iters = data.shape[0]
    
    # Even smaller scaling for compact grid
    fig_width = max(8, n_agents * 0.6) 
    fig_height = max(4, n_iters * 0.6)
    
    fig, ax = plt.subplots(figsize=(fig_width, fig_height))
    
    # Check if we should use custom formatting (split text)
    use_annot = annot_mat if not custom_fmt else None
    
    sns.heatmap(data, ax=ax, cmap=cmap, cbar=True, annot=use_annot, fmt='', 
                linewidths=0, linecolor='none', vmin=vmin, vmax=vmax,
                square=True, # Force square cells
                annot_kws={'size': 5, 'va': 'center'})
                
    # Manual Text Placement for Split Formatting (Big Plan ID, small CC)
    if custom_fmt:
        for i in range(n_iters):
            for j in range(n_agents):
                text_content = annot_mat[i, j]
                parts = text_content.split('\n')
                if len(parts) >= 2:
                    # Assume Part 1 is Plan ID (Big), Part 2 is CC (Small)
                    # Coordinates: x = j + 0.5, y = i + 0.5 is center
                    
                    # Plan ID (Big, Normal) - shifted up
                    ax.text(j + 0.5, i + 0.45, parts[0], 
                            ha='center', va='center', fontsize=9, weight='normal', color='black')
                    
                    # CC (Small, Normal) - shifted down
                    ax.text(j + 0.5, i + 0.75, parts[1], 
                            ha='center', va='center', fontsize=5, weight='normal', color='black')
                else:
                    # Fallback
                    ax.text(j + 0.5, i + 0.5, text_content, 
                             ha='center', va='center', fontsize=6, weight='bold', color='black')

    ax.set_xlabel('Agent', fontsize=12, labelpad=10)
    ax.set_ylabel('Iteration', fontsize=14, labelpad=10)
    
    ax.set_xticklabels([a.replace('agent-','') for a in agents], rotation=0, fontsize=12)
    ax.set_yticklabels(iterations, fontsize=12)
    
    if title:
        ax.set_title(title, fontsize=16, pad=20)
        
    # Global Cost Column
    if global_series is not None:
        from mpl_toolkits.axes_grid1 import make_axes_locatable
        divider = make_axes_locatable(ax)
        ax2 = divider.append_axes('right', size='10%', pad=0.6)
        ax2.axis('off')
        ax2.set_title("Global\nCost", fontsize=12, pad=10, weight='bold')
        ax2.set_ylim(0, 1)
        
        for i, it in enumerate(iterations):
            val = global_series.loc[global_series.index == it]
            text_val = ''
            if not val.empty:
                text_val = f'{val.values[0]:.3f}'
            
            y_pos = 1.0 - (i + 0.5) / n_iters
            ax2.text(0.5, y_pos, text_val, ha='left', va='center', fontsize=12, weight='bold')

    out_path = os.path.join(run_dir, out_filename)
    plt.tight_layout()
    plt.savefig(out_path, dpi=200)
    plt.close()
    print(f'Wrote heatmap to {out_path}')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('run_dir', help='Path to a single run output folder')
    parser.add_argument('--run', type=int, default=0, help='which Run index to use from CSVs')
    parser.add_argument('--out', default='heatmap.png', help='Ignored if producing distinct files') 
    args = parser.parse_args()

    run_dir = args.run_dir
    alpha, beta, local_cost_func, num_plans = read_used_conf(run_dir)

    plan_mat, iterations, agents = read_selected_plans(run_dir, run_idx=args.run)
    local_df, complex_df = read_aggregated_metrics(run_dir, run_idx=args.run)
    global_series = read_global_costs(run_dir, run_idx=args.run)
    
    # Common Palette
    # Updated Plan ID Palette (Paired-like)
    from matplotlib.colors import ListedColormap
    colors_plan = [
        '#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', 
        '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a', '#ffff99'
    ]
    # For categorical data like Plan ID, a ListedColormap is better than LinearSegmented
    # However, to keep code simple with existing flow, we can use Listed if we ensure vmin/vmax match integer indices
    cmap_plan = ListedColormap(colors_plan, name="custom_paired")
    
    # Original Red palette for Local Cost
    colors_red = ['#ffffb2', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#b10026']
    cmap_red = LinearSegmentedColormap.from_list("custom_orange_red", colors_red, N=256)
    
    sns.set(context='notebook', style='white')

    title_lines = []
    if alpha is not None and beta is not None:
        title_lines.append(f'alpha={alpha}, beta={beta}')
    base_title = ' '.join(title_lines)

    # --- Heatmap 1: Color by Plan ID ---
    # Annotations: LC & CC
    ann_1 = build_annotation_matrix(plan_mat, iterations, local_df, complex_df, style='pid_color')
    
    # Check if we have enough colors for num_plans
    # If num_plans > len(colors_plan), the colormap will cycle or clip? 
    # ListedColormap with standard heatmap behavior:
    # If we pass integer values 0..N, we want discrete colors.
    
    vmin_1 = 0
    vmax_1 = num_plans - 1 if num_plans else None
    
    # Ensure cmap has enough entries or cycle them
    # If we just use the list, matplotlib handles mapping
    
    plot_single_heatmap(
        run_dir, 'heatmap_by_plan.png', 
        plan_mat.astype(float), ann_1, iterations, agents,
        cmap_plan, vmin_1, vmax_1, 
        base_title + " (Color: Plan ID)", global_series
    )
    
    # --- Heatmap 2: Color by Local Cost ---
    # Annotations: PlanID & CC
    ann_2 = build_annotation_matrix(plan_mat, iterations, local_df, complex_df, style='lc_color')
    
    local_cost_mat = get_aligned_matrix(iterations, local_df, plan_mat.shape)
    
    # Check bounds for colors
    valid_lc = local_cost_mat[~np.isnan(local_cost_mat)]
    if len(valid_lc) > 0:
        vmin_2, vmax_2 = np.min(valid_lc), np.max(valid_lc)
    else:
        vmin_2, vmax_2 = None, None
        
    plot_single_heatmap(
        run_dir, 'heatmap_by_cost.png', 
        local_cost_mat, ann_2, iterations, agents,
        cmap_red, vmin_2, vmax_2, 
        base_title + " (Color: Local Cost)", global_series, custom_fmt=True
    )

if __name__ == '__main__':
    main()
