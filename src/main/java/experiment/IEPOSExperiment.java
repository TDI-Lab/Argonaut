package experiment;

import java.io.File;
import java.io.IOException;
import java.io.PrintWriter;
import java.io.BufferedWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.function.Function;
import java.util.logging.Handler;
import java.util.logging.Level;
import java.util.logging.LogManager;
import java.util.logging.Logger;

import agent.Agent;
import agent.ModifiableIeposAgent;
import agent.MultiObjectiveIEPOSAgent;
import agent.PlanSelector;
import agent.dataset.AgentsBehaviour;
import agent.logging.AgentLogger;
import agent.logging.AgentLoggingProvider;
import agent.logging.LoggingProvider;
import agent.logging.instrumentation.CustomFormatter;
import agent.planselection.MultiObjectiveIeposPlanSelector;
import config.Configuration;
import data.Plan;
import data.Vector;
import protopeer.Experiment;
import protopeer.Peer;
import protopeer.PeerFactory;
import protopeer.SimulatedExperiment;
import protopeer.util.quantities.Time;
import treestructure.ModifiableTreeArchitecture;
import util.NarrativeWriter;

/**
 * 
 * 
 * @author Jovan N., Thomas Asikis
 *
 */
public class IEPOSExperiment {

	public static Integer[][] mappings; // store the shuffled mapping of agents sequence in each simulation
	public static java.util.Map<Integer, Agent> agentsMap = new java.util.HashMap<>();

	public static void runSimulation(int numChildren, // number of children for each middle node
			int numIterations, // total number of iterations to run for
			int numAgents, // total number of nodes in the network
			Function<Integer, Agent> createAgent, // lambda expression that creates an agent
			Configuration config) {
		
		agentsMap.clear();
		
		// NarrativeWriter.clear(); // Clear previous logs - Moved to main to persist across simulations
        NarrativeWriter.write("=== STARTING SIMULATION ===");
        NarrativeWriter.write("Configuration:");
        NarrativeWriter.write("  - Agents: " + numAgents);
        NarrativeWriter.write("  - Iterations: " + numIterations);
        NarrativeWriter.write("  - Plans per Agent: " + Configuration.numPlans);
        NarrativeWriter.write("  - Vector Dimension: " + Configuration.planDim);
        NarrativeWriter.write("  - Reorganization Strategy: " + config.reorganizationStrategy);
        NarrativeWriter.write("===========================");

		SimulatedExperiment experiment = new SimulatedExperiment() {
		};
		ModifiableTreeArchitecture architecture = new ModifiableTreeArchitecture(config);

		SimulatedExperiment.initEnvironment();
		experiment.init();
		PeerFactory peerFactory = new PeerFactory() {
			@Override
			public Peer createPeer(int peerIndex, Experiment e) {
				Agent newAgent = createAgent.apply(peerIndex);
				agentsMap.put(peerIndex, newAgent);
				Peer newPeer = new Peer(peerIndex);

				architecture.addPeerlets(newPeer, newAgent, peerIndex, numAgents);

				return newPeer;
			}
		};

		Logger rootLogger = LogManager.getLogManager().getLogger("");
		rootLogger.setLevel(config.loggingLevel);
		for (Handler h : rootLogger.getHandlers()) {
			h.setLevel(config.loggingLevel);
			h.setFormatter(new CustomFormatter());
		}

		experiment.initPeers(0, numAgents, peerFactory);
		experiment.startPeers(0, numAgents);
		experiment.runSimulation(Time.inSeconds(3 + numIterations));
	}

	private static void runOneSimulation(Configuration config, Function<Integer, Agent> createAgent) {
		long timeBefore = System.currentTimeMillis();
		IEPOSExperiment.runSimulation(Configuration.numChildren, Configuration.numIterations,
				Configuration.numAgents, createAgent, config);
		long timeAfter = System.currentTimeMillis();
		System.out.println("IEPOS Finished! It took: " + ((timeAfter - timeBefore) / 1000) + " seconds.");
	}


	public static void main(String[] args) {
		Logger log = Logger.getLogger(IEPOSExperiment.class.getName());

		String confPath = null;

		if (args.length > 0) {
			Path pathURI = Paths.get(args[0]);

			if (!Files.notExists(pathURI) && Files.isRegularFile(pathURI)) {
				log.log(Level.INFO, "Configuration file path provided from command line, "
						+ "overriding default conf location and using file in: \n" + pathURI.toString());
				confPath = pathURI.toString();
			}

		}

		String rootPath = System.getProperty("user.dir");

		confPath = confPath == null ? rootPath + File.separator + "conf" + File.separator + "epos.properties"
				: confPath;


		Configuration config = Configuration.fromFile(confPath);
		config.printConfiguration();


		LoggingProvider<MultiObjectiveIEPOSAgent<Vector>> loggingProvider = new LoggingProvider<>();
		
		for (AgentLogger logger : config.loggers) {
			loggingProvider.add(logger);
		}

		mappings = new Integer[Configuration.numSimulations-1][Configuration.numAgents]; // generate the mappings matrix

		NarrativeWriter.clear(); // Clear logs at the start of the experiment (persists across simulations)

		for (int sim = 0; sim < Configuration.numSimulations; sim++) {

			System.out.println("Simulation " + (sim + 1));
			NarrativeWriter.write("\n=== Simulation " + (sim + 1) + " ===");

			final int simulationId = sim;
			config.permutationSeed = sim;

			for (AgentLogger al : loggingProvider.getLoggers()) {
				al.setRun(sim);
			}

			if (Configuration.numSimulations > 1 && sim > 0) {
				Configuration.mapping = config.generateMappingForRepetitiveExperiments.apply(config);
				// the shuffling begins at the second simulation, so the mappings begins to store the shuffled mapping
				// i is the identification of vertices, the stored value is the identification of agent
				for (int i = 0; i < Configuration.numAgents; i++) {
					mappings[sim-1][i] = Configuration.mapping.get(i);				
				}
			}

			PlanSelector<MultiObjectiveIEPOSAgent<Vector>, Vector> planSelector = new MultiObjectiveIeposPlanSelector<Vector>();

			/**
			 * Function that creates an Agent given the id of it's vertex in tree graph.
			 * First type is input argument, second type is type of return value.
			 */
			Function<Integer, Agent> createAgent = agentIdx -> {

				List<Plan<Vector>> possiblePlans = config.getDataset(Configuration.dataset)
						.getPlans(Configuration.mapping.get(agentIdx));
				AgentLoggingProvider<ModifiableIeposAgent<Vector>> agentLP = loggingProvider
						.getAgentLoggingProvider(agentIdx, simulationId);

				ModifiableIeposAgent<Vector> newAgent = new ModifiableIeposAgent<Vector>(config, possiblePlans,
						agentLP);

				/**
				 * Different behaviours: read from a file 
				 */
				if (config.behaviours.equals("different")) {
					AgentsBehaviour p = new AgentsBehaviour(Configuration.dataset);
				
						p.readBehaviours();
						Double alphaValue = p.alphaMap.get(agentIdx.toString());
						Double betaValue = p.betaMap.get(agentIdx.toString());
				
				
					newAgent.setUnfairnessWeight(alphaValue);
					newAgent.setLocalCostWeight(betaValue);
					}
	
				/**
				 * For same behaviours: read from properties
				 */

				else {
		
					newAgent.setUnfairnessWeight(Double.parseDouble(config.weights[0]));		
					newAgent.setLocalCostWeight(Double.parseDouble(config.weights[1]));	
	
				}
				newAgent.setPlanSelector(planSelector);
				return newAgent;

			};

			IEPOSExperiment.runOneSimulation(config, createAgent);
		}

		// Added by Ana
		StringBuilder sb = new StringBuilder();
		for (int i = 0; i < mappings.length; i++) {
			for (int j = 0; j < mappings[i].length-1; j++) {
				sb.append(String.valueOf(mappings[i][j]) + ",");
			}
			sb.append(String.valueOf(mappings[i][mappings[i].length-1]) + "\n");
		}
		try (PrintWriter out = new PrintWriter(new BufferedWriter(
				new java.io.FileWriter(Configuration.outputDirectory + File.separator + "mappings.csv", true)))) {
			out.append(sb.toString());
		}
		catch (IOException e){
			e.printStackTrace();
		}
		// End of Added by Ana

		loggingProvider.print();

		try {
			Path source = Paths.get("algorithm_log.txt");
			if (Configuration.outputDirectory != null && Files.exists(source)) {
				Path dest = Paths.get(Configuration.outputDirectory + File.separator + "algorithm_log.txt");
				Files.copy(source, dest, StandardCopyOption.REPLACE_EXISTING);
				System.out.println("algorithm_log.txt copied to " + dest.toString());
			}
		} catch (IOException e) {
			System.err.println("Failed to copy algorithm_log.txt: " + e.getMessage());
		}

		// --- Trigger Visualization if -Dvisualise is present ---
		if (System.getProperty("visualise") != null) {
			System.out.println("Visualization flag detected. Generating visualizations...");
			if (Configuration.outputDirectory != null) {
				try {
					String scriptPath = "./generate_visualizations.sh";
					// Ensure the script is executable
					File scriptFile = new File(scriptPath);
					if (scriptFile.exists()) {
						if (!scriptFile.canExecute()) {
							scriptFile.setExecutable(true);
						}

						ProcessBuilder pb = new ProcessBuilder(scriptPath, Configuration.outputDirectory);
						pb.inheritIO(); // Pipe output to console
						Process process = pb.start();
						int exitCode = process.waitFor();

						if (exitCode == 0) {
							System.out.println("Visualization generation completed successfully.");
						} else {
							System.err.println("Visualization generation failed with exit code: " + exitCode);
						}
					} else {
						System.err.println("Error: generate_visualizations.sh not found at " + scriptFile.getAbsolutePath());
					}
				} catch (Exception e) {
					System.err.println("Error executing visualization script: " + e.getMessage());
					e.printStackTrace();
				}
			} else {
				System.err.println("Output directory is null, cannot generate visualizations.");
			}
		}
		// -----------------------------------------------------

	}

	public static void logTreeState(int iteration) {
		NarrativeWriter.write("\n[Iter " + iteration + "] [TREE STATE]\n");
		// Find root
		agent.TreeAgent root = null;
		for (Agent a : agentsMap.values()) {
			if (a instanceof agent.TreeAgent) {
				agent.TreeAgent ta = (agent.TreeAgent) a;
				if (ta.getParent() == null) {
					root = ta;
					break;
				}
			}
		}

		if (root != null) {
			printTree(root, "", true);
		} else {
			NarrativeWriter.write("Root not found!\n");
		}
		NarrativeWriter.write("\n");
	}

	private static int getFingerId(protopeer.Finger finger) {
		String s = finger.toString();
		try {
			String content = s.substring(1, s.length() - 1);
			String[] parts = content.split(",");
			return Integer.parseInt(parts[0].trim());
		} catch (Exception e) {
			return -1;
		}
	}

	private static void printTree(agent.TreeAgent node, String prefix, boolean isTail) {
		int id = node.getPeer().getIndexNumber();
		int planID = node.getSelectedPlanID();
		
		int actualId = id;
        if (Configuration.mapping != null && Configuration.mapping.containsKey(id)) {
            actualId = Configuration.mapping.get(id);
        }
		
		NarrativeWriter.write(prefix + (isTail ? "└── " : "├── ") + "Agent " + actualId + " (Plan: " + planID + ")");
		
		List<protopeer.Finger> children = node.getChildren();
		for (int i = 0; i < children.size() - 1; i++) {
			int childId = getFingerId(children.get(i));
			Agent childAgent = agentsMap.get(childId);
			if (childAgent instanceof agent.TreeAgent) {
				printTree((agent.TreeAgent) childAgent, prefix + (isTail ? "    " : "│   "), false);
			}
		}
		if (children.size() > 0) {
			int childId = getFingerId(children.get(children.size() - 1));
			Agent childAgent = agentsMap.get(childId);
			if (childAgent instanceof agent.TreeAgent) {
				printTree((agent.TreeAgent) childAgent, prefix + (isTail ? "    " : "│   "), true);
			}
		}
	}

}
