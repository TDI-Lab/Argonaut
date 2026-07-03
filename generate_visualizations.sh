#!/bin/bash

if [ -z "$1" ]; then
    echo "Usage: $0 <output_directory>"
    echo "Example: $0 output/gaussian_1234567890"
    exit 1
fi

TARGET_DIR=$1

echo "--- Step 1: Extracting Costs from Log ---"
./venv/bin/python3 scripts/extract_costs_from_log.py "$TARGET_DIR"

echo "--- Step 2: Generating Heatmaps ---"
# This script now generates heatmap_by_plan.png and heatmap_by_cost.png
./venv/bin/python3 scripts/generate_heatmap.py "$TARGET_DIR"

echo "--- Step 3: Generating Radial PNGs ---"
./venv/bin/python3 scripts/generate_radial_pngs_new.py "$TARGET_DIR"

echo "--- All Done! ---"
echo "Check $TARGET_DIR for heatmap.png and radial PNGs"
