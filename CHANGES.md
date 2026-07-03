### Compile: (requires installation of `Maven`) jar generated in `target` folder

$ mvn clean install

### CCF: Custom Cost Function

Location: src/main/java/func/CustomCostFunction.java (entirely new file)

Description: To make a new cost function (global) you have to write a new class with some overloads and overrides. Exactly that has been done.

### mappings.csv:

Location: src/main/java/experiment/IEPOSExperiment.java (lines 195-210)

Description: Runtime-agent (or positions in the tree structure) to input-agent mappings change across simulations. `Configuration.mapping` stores that in each simulation. In the `IEPOSExperiment.java` file a `mappings` variable stores these mappings. We added some code to write that into a `mappings.csv` in the timestamped output folder (<dataset-name>\_<timestamp> folder in `output`)

A Common Confusion: A to B or B to A???
Consider 3 agents 0, 1, 2
The First line of mappings.csv says 1,2,0
This means 0th position in the tree is mapped to agent 1, 1st position is mapped to agent 2, 2nd position is mapped to agent 0
That means whatever EPOS is now considering as agent 0 is actually agent 1 of my input and so on

### Optimisation Process Logger

Location: algorithm_log.txt

Description: Added detailed logging to the `algorithm_log.txt` file. This logging occurs in the `down()` phase of the agent and outputs a breakdown of the cost components: Global Cost, Local Cost (Discomfort), and Unfairness, along with their respective weights and the total weighted cost. This helps in understanding how the plan selection is influenced by the alpha and beta parameters.

How to Run:
Execute the experiment using Maven:

```bash
mvn compile exec:java -Dexec.mainClass="experiment.IEPOSExperiment" -Djava.awt.headless=true
```

The log will be generated in the file `algorithm_log.txt` in the project root.

### Automatic Visualization Generation

Location: `src/main/java/experiment/IEPOSExperiment.java` (trigger) & `scripts/` (python generation scripts)

Description:
A new suite of visualization tools has been integrated to generate:

1.  **Heatmaps**: Agent vs Iteration grids showing selected plans and costs.
2.  **Tree Topology**: Detailed visual representation of the agent tree structure for each iteration, including:
    - Nodes colored by selected plan.
    - Arrows (Green ↓ / Red ↑) showing Local Cost and Global Cost changes.
    - Detailed cost breakdown per agent.
    - Video generation of the tree evolution over iterations.

Prerequisites & Setup:

Ensure you have Python 3 and FFmpeg installed.
The visualization scripts require specific Python libraries. It is recommended to use a virtual environment:

```bash
# Create virtual environment
python3 -m venv venv

# Activate it
source venv/bin/activate

# Install dependencies
pip install matplotlib pandas seaborn networkx numpy
```

Note: Video generation requires `ffmpeg` to be installed and available in your system PATH.

How to Run:
Append the `-Dvisualise` flag to your maven command:

```bash
mvn clean compile exec:java -Dexec.mainClass="experiment.IEPOSExperiment" -Dvisualise
```

This will automatically execute the `generate_visualizations.sh` script after the simulation finishes, creating heatmaps and a `tree_visualizations` folder inside the run's output directory.

To create radial tree PNGs for visualiser run:

```bash
python3 scripts/generate_radial_pngs_new.py "$dir";
```
