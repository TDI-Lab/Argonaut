package com.epos.api.service;

import com.epos.api.model.JobState;
import com.epos.api.model.RunRequest;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.stream.Stream;

@Service
public class JobService {

    private static class CachedResults {
        final Map<String, Object> results = new ConcurrentHashMap<>();
        String logs = "";
        String iterationHistory = null;
        String vizData = null;
    }

    private final Map<String, CachedResults> cache = new ConcurrentHashMap<>();
    private final Map<String, JobState> jobs = new ConcurrentHashMap<>();
    private final ExecutorService executor = Executors.newFixedThreadPool(4);
    private volatile List<String> cachedDatasetList = null;
    private final Map<String, String> datasetJsonCache = new ConcurrentHashMap<>();

    // ── Cache Key Helper ──────────────────────────────────────────────────────

    private String computeFilesHash(MultipartFile[] files) {
        try {
            java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
            for (MultipartFile file : files) {
                digest.update(file.getBytes());
            }
            byte[] hash = digest.digest();
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (Exception e) {
            return String.valueOf(System.currentTimeMillis());
        }
    }

    private String getConfigKey(MultipartFile[] files, RunRequest req) {
        String filesHash = computeFilesHash(files);
        return filesHash + "_" + req.numAgents + "_" + req.numPlans + "_" + req.planDim + "_" + req.numIterations + "_" + req.numChildren + "_" + req.numSimulations + "_" + req.alpha + "_" + req.beta + "_" + req.globalCostFunction + "_" + req.localCostFunction + "_" + req.goalSignal + "_" + req.datasetType;
    }

    private void saveToCache(CachedResults cached, JobState state) {
        if (state.results != null) {
            cached.results.putAll(state.results);
        }
        if (state.logs != null) {
            cached.logs = state.logs;
        }
        try {
            if (state.cachedIterationHistory != null) {
                cached.iterationHistory = state.cachedIterationHistory;
            } else {
                String hist = getIterationHistory(state.jobId);
                if (hist != null) {
                    cached.iterationHistory = hist;
                    state.cachedIterationHistory = hist;
                }
            }
            if (state.cachedVizData != null) {
                cached.vizData = state.cachedVizData;
            } else {
                String viz = getVizData(state.jobId);
                if (viz != null) {
                    cached.vizData = viz;
                    state.cachedVizData = viz;
                }
            }
        } catch (Exception ignored) {}
    }

    // ── Submit ────────────────────────────────────────────────────────────────

    public String submitJob(MultipartFile[] files, RunRequest req) throws IOException {
        String configKey = getConfigKey(files, req);
        CachedResults cached = cache.computeIfAbsent(configKey, k -> new CachedResults());

        String jobId  = UUID.randomUUID().toString();
        Path workDir  = Files.createTempDirectory("epos-" + jobId);
        Path datasetDir = workDir.resolve("datasets/uploaded");
        Path confDir    = workDir.resolve("conf");
        Files.createDirectories(datasetDir);
        Files.createDirectories(confDir);

        // Always rename to agent_0.plans, agent_1.plans, … (sequential index)
        for (int i = 0; i < files.length; i++) {
            Files.write(datasetDir.resolve("agent_" + i + ".plans"), files[i].getBytes());
        }
        if (req.numAgents <= 0) req.numAgents = files.length;

        if ("EPOS".equalsIgnoreCase(req.algorithm) || "BOTH".equalsIgnoreCase(req.algorithm)) {
            writeConfig(confDir, req, req.numAgents);
            copyBundledConfFiles(confDir);
            String signal = (req.goalSignal != null && !req.goalSignal.isBlank())
                    ? req.goalSignal.trim()
                    : String.join(",", java.util.Collections.nCopies(req.planDim, "0.0"));
            Files.writeString(datasetDir.resolve("zero.target"), signal);
        }

        JobState state = new JobState(jobId, workDir);
        state.status       = "RUNNING";
        state.algorithm    = req.algorithm;
        state.numAgents    = req.numAgents > 0 ? req.numAgents : files.length;
        state.numPlans     = req.numPlans;
        state.numIterations = req.numIterations;
        state.numChildren  = req.numChildren;
        state.numSimulations = req.numSimulations;
        state.alpha        = req.alpha;
        state.beta         = req.beta;
        jobs.put(jobId, state);

        boolean hasCachedEpos = cached.results.containsKey("global-cost");
        boolean hasCachedBf = cached.results.containsKey("solutionwiseresults");

        if ("BRUTE_FORCE".equalsIgnoreCase(req.algorithm)) {
            if (hasCachedBf) {
                state.results = new LinkedHashMap<>(cached.results);
                state.logs = cached.logs;
                state.cachedIterationHistory = cached.iterationHistory;
                state.cachedVizData = cached.vizData;
                state.status = "COMPLETED";
            } else {
                state.currentPhase = "BRUTE_FORCE";
                executor.submit(() -> {
                    runBruteForce(state, datasetDir);
                    if ("COMPLETED".equals(state.status)) {
                        saveToCache(cached, state);
                    }
                });
            }
        } else if ("BOTH".equalsIgnoreCase(req.algorithm)) {
            if (hasCachedEpos && hasCachedBf) {
                state.results = new LinkedHashMap<>(cached.results);
                state.logs = cached.logs;
                state.cachedIterationHistory = cached.iterationHistory;
                state.cachedVizData = cached.vizData;
                state.status = "COMPLETED";
            } else {
                state.currentPhase = "EPOS";
                executor.submit(() -> {
                    if (hasCachedEpos) {
                        state.results = new LinkedHashMap<>(cached.results);
                        state.logs = cached.logs;
                        state.cachedIterationHistory = cached.iterationHistory;
                        state.cachedVizData = cached.vizData;
                    } else {
                        runEpos(state, true);
                        if (!state.wasKilled && !"FAILED".equals(state.status)) {
                            saveToCache(cached, state);
                        }
                    }
                    if (!state.wasKilled && !"FAILED".equals(state.status)) {
                        state.currentPhase = "BRUTE_FORCE";
                        if (hasCachedBf) {
                            if (state.results == null) state.results = new LinkedHashMap<>();
                            state.results.putAll(cached.results);
                            if (cached.logs != null) {
                                state.logs = (state.logs == null ? "" : state.logs) + "\n\n=== BRUTE FORCE LOGS ===\n\n" + cached.logs;
                            }
                            state.status = "COMPLETED";
                        } else {
                            runBruteForce(state, datasetDir);
                            if (!state.wasKilled && !"FAILED".equals(state.status)) {
                                saveToCache(cached, state);
                                state.status = "COMPLETED";
                            }
                        }
                    }
                });
            }
        } else {
            if (hasCachedEpos) {
                state.results = new LinkedHashMap<>(cached.results);
                state.logs = cached.logs;
                state.cachedIterationHistory = cached.iterationHistory;
                state.cachedVizData = cached.vizData;
                state.status = "COMPLETED";
            } else {
                state.currentPhase = "EPOS";
                executor.submit(() -> {
                    runEpos(state, false);
                    if ("COMPLETED".equals(state.status)) {
                        saveToCache(cached, state);
                    }
                });
            }
        }
        return jobId;
    }

    // ── EPOS subprocess ───────────────────────────────────────────────────────

    private void writeConfig(Path confDir, RunRequest req, int numAgents) throws IOException {
        String props = "dataset=uploaded\n"
                + "numSimulations=" + req.numSimulations + "\n"
                + "numIterations=" + req.numIterations + "\n"
                + "numAgents=" + numAgents + "\n"
                + "numPlans=" + req.numPlans + "\n"
                + "planDim=" + req.planDim + "\n"
                + "numChildren=" + req.numChildren + "\n"
                + "shuffle=0\n"
                + "shuffle_file=permutation.csv\n"
                + "numberOfWeights=2\n"
                + "weightsString=" + req.alpha + "," + req.beta + "\n"
                + "behaviours=same\n"
                + "agentsBehavioursPath=default\n"
                + "constraint=SOFT\n"
                + "constraintPlansPath=default\n"
                + "constraintCostsPath=default\n"
                + "strategy=never\n"
                + "periodically.reorganizationPeriod=3\n"
                + "convergence.memorizationOffset=5\n"
                + "globalCost.reductionThreshold=0.5\n"
                + "strategy.reorganizationSeed=1\n"
                + "goalSignalPath=datasets/uploaded/zero.target\n"
                + "globalCostFunction=" + req.globalCostFunction + "\n"
                + "localCostFunction=" + req.localCostFunction + "\n"
                + "scaling=MIN-MAX\n"
                + "logLevel=SEVERE\n"
                + "logger.GlobalCostLogger=true\n"
                + "logger.LocalCostMultiObjectiveLogger=true\n"
                + "logger.UnfairnessLogger=true\n"
                + "logger.GlobalComplexCostLogger=true\n"
                + "logger.SelectedPlanLogger=true\n"
                + "logger.GlobalResponseVectorLogger=true\n"
                + "logger.PlanFrequencyLogger=true\n"
                + "logger.TerminationLogger=true\n"
                + "logger.AlgorithmLogger=true\n";
        Files.writeString(confDir.resolve("epos.properties"), props);
    }

    private void copyBundledConfFiles(Path confDir) {
        String[] names = {"log4j.properties", "measurement.conf", "protopeer.conf"};
        for (String name : names) {
            try (InputStream is = getClass().getClassLoader()
                    .getResourceAsStream("epos-conf/" + name)) {
                if (is != null)
                    Files.copy(is, confDir.resolve(name), StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException ignored) {}
        }
    }

    private void runEpos(JobState state, boolean isBoth) {
        try {
            String jarPath = resolveJarPath();
            ProcessBuilder pb = new ProcessBuilder(
                    "java", "-jar", jarPath,
                    state.workDir.resolve("conf/epos.properties").toString()
            );
            pb.directory(state.workDir.toFile());
            pb.redirectErrorStream(true);

            Process proc = pb.start();
            state.process = proc;
            String output = new String(proc.getInputStream().readAllBytes());
            int exitCode  = proc.waitFor();

            state.logs = output.length() > 8000 ? output.substring(output.length() - 8000) : output;

            if (exitCode != 0 && !state.wasKilled) {
                state.status = "FAILED";
                state.error  = "EPOS exited with code " + exitCode;
                return;
            }

            Path outputBase = state.workDir.resolve("output");
            if (Files.exists(outputBase)) {
                try (Stream<Path> dirs = Files.list(outputBase)) {
                    dirs.filter(Files::isDirectory)
                        .filter(p -> p.getFileName().toString().startsWith("uploaded_"))
                        .findFirst()
                        .ifPresent(dir -> {
                            state.outputDir = dir;
                            try { state.results = readEposResults(dir); }
                            catch (IOException e) { state.error = "Failed to read results: " + e.getMessage(); }
                        });
                }
            }

            // Generate experiments.json for the frontend visualizer (non-fatal)
            if (state.outputDir != null) {
                runGenerateVizData(state);
            }

            if (state.wasKilled) {
                state.status = "KILLED";
            } else {
                if (state.results == null) {
                    state.status = "FAILED";
                    if (state.error == null) {
                        state.error = "Output directory not found after run.";
                    }
                } else if (!isBoth) {
                    state.status = "COMPLETED";
                }
            }

        } catch (Exception e) {
            state.status = "FAILED";
            state.error  = e.getClass().getSimpleName() + ": " + e.getMessage();
        }
    }

    private Map<String, Object> readEposResults(Path outputDir) throws IOException {
        Map<String, Object> r = new LinkedHashMap<>();
        for (String f : new String[]{
                "global-cost.csv", "unfairness.csv", "local-cost.csv",
                "global-complex-cost.csv", "selected-plans.csv",
                "indexes-histogram.csv", "termination.csv"}) {
            Path p = outputDir.resolve(f);
            if (Files.exists(p)) r.put(f.replace(".csv", ""), Files.readString(p));
        }
        return r;
    }

    // ── Brute-force subprocess ────────────────────────────────────────────────

    private void runBruteForce(JobState state, Path datasetDir) {
        String python = null;
        String scriptPath = null;
        Path scriptDir = null;
        long numAgents = 0;
        int numPlans = 3;
        Path outputDir = null;
        String output = "";
        int exit = -1;

        try {
            python = resolvePython();
            scriptPath = resolvePythonScript();   // full path to run_experiment.py
            scriptDir  = java.nio.file.Paths.get(scriptPath).getParent();

            // Count agents and plans from uploaded files
            try (Stream<Path> s = Files.list(datasetDir)) {
                numAgents = s.filter(p -> p.getFileName().toString().endsWith(".plans")).count();
            }
            try (Stream<Path> s = Files.list(datasetDir)) {
                java.util.Optional<Path> first = s
                        .filter(p -> p.getFileName().toString().endsWith(".plans"))
                        .findFirst();
                if (first.isPresent()) {
                    numPlans = (int) Files.lines(first.get())
                            .filter(l -> !l.isBlank()).count();
                }
            }

            String folderName = numAgents + "_agent_" + numPlans + "_plan_uploaded_" + System.currentTimeMillis();
            outputDir = state.workDir.resolve(folderName);

            ProcessBuilder pb = new ProcessBuilder(
                    python, scriptPath,
                    "--agents", String.valueOf(numAgents),
                    "--plan",   String.valueOf(numPlans),
                    "--dataset_folder", datasetDir.toAbsolutePath().toString(),
                    "--output_folder", outputDir.toAbsolutePath().toString()
            );
            pb.directory(state.workDir.toFile());
            pb.redirectErrorStream(true);

            Process proc = pb.start();
            state.process = proc;

            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(proc.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line).append("\n");
                }
            } catch (IOException e) {
                if (!state.wasKilled) {
                    throw e;
                }
            }
            output = sb.toString();

            try {
                exit = proc.waitFor();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                if (!state.wasKilled) {
                    throw new IOException("Process interrupted", e);
                }
            }

            String bfLogs = output.length() > 16000 ? output.substring(output.length() - 16000) : output;
            if (state.logs == null || state.logs.isBlank()) {
                state.logs = bfLogs;
            } else {
                state.logs = state.logs + "\n\n=== BRUTE FORCE LOGS ===\n\n" + bfLogs;
            }

            if (exit != 0 && !state.wasKilled) {
                state.status = "FAILED";
                state.error  = "Brute force failed: " + output.trim();
                return;
            }

            if (state.wasKilled) {
                try {
                    Thread.sleep(1000); // Allow OS to flush files
                } catch (InterruptedException ignored) {}
            }

            if (outputDir == null || !Files.exists(outputDir)) {
                state.status = "FAILED";
                state.error  = "Output directory not found after brute force run.";
                return;
            }

            state.outputDir = outputDir;

            Map<String, Object> r = new LinkedHashMap<>();
            for (String fname : new String[]{"solutionwiseresults.csv", "epossimulationresults.csv"}) {
                Path p = outputDir.resolve(fname);
                if (Files.exists(p)) r.put(fname.replace(".csv", ""), Files.readString(p));
            }
            Path sumPath = outputDir.resolve("summary.json");
            if (Files.exists(sumPath)) r.put("summary", Files.readString(sumPath));

            if (!r.isEmpty()) {
                if (state.results == null) {
                    state.results = new LinkedHashMap<>();
                }
                state.results.putAll(r);
            }
            if (state.wasKilled) {
                state.status = "KILLED";
            } else {
                state.status  = (state.results != null) ? "COMPLETED" : "FAILED";
                if (state.results == null) state.error = "Brute force produced no output.";
            }

        } catch (Exception e) {
            if (state.wasKilled && outputDir != null && Files.exists(outputDir)) {
                try {
                    state.outputDir = outputDir;
                    Map<String, Object> r = new LinkedHashMap<>();
                    for (String fname : new String[]{"solutionwiseresults.csv", "epossimulationresults.csv"}) {
                        Path p = outputDir.resolve(fname);
                        if (Files.exists(p)) r.put(fname.replace(".csv", ""), Files.readString(p));
                    }
                    Path sumPath = outputDir.resolve("summary.json");
                    if (Files.exists(sumPath)) r.put("summary", Files.readString(sumPath));

                    if (!r.isEmpty()) {
                        if (state.results == null) {
                            state.results = new LinkedHashMap<>();
                        }
                        state.results.putAll(r);
                    }
                    state.status = "KILLED";
                    return;
                } catch (Exception ignored) {}
            }
            state.status = "FAILED";
            state.error  = e.getClass().getSimpleName() + ": " + e.getMessage();
        }
    }

    public String getIterationHistory(String jobId) throws IOException {
        JobState s = jobs.get(jobId);
        if (s == null) return null;
        if (s.cachedIterationHistory != null) return s.cachedIterationHistory;
        if (s.outputDir == null) return null;
        Path p = s.outputDir.resolve("iteration_cost_history.csv");
        return Files.exists(p) ? Files.readString(p) : null;
    }

    public String getVizData(String jobId) throws IOException {
        JobState s = jobs.get(jobId);
        if (s == null) return null;
        if (s.cachedVizData != null) return s.cachedVizData;
        if (s.outputDir != null) {
            Path p = s.outputDir.resolve("experiments.json");
            if (Files.exists(p)) return Files.readString(p);
        }
        // Fallback: search under workDir/output/uploaded_*
        if (s.workDir != null) {
            Path outputBase = s.workDir.resolve("output");
            if (Files.exists(outputBase)) {
                try (Stream<Path> dirs = Files.list(outputBase)) {
                    Optional<Path> found = dirs.filter(Files::isDirectory)
                            .filter(p -> p.getFileName().toString().startsWith("uploaded_"))
                            .findFirst();
                    if (found.isPresent()) {
                        Path p = found.get().resolve("experiments.json");
                        if (Files.exists(p)) return Files.readString(p);
                    }
                }
            }
        }
        return null;
    }

    public List<String> getBfImageList(String jobId) {
        JobState s = jobs.get(jobId);
        if (s == null || s.outputDir == null) return null;
        Path vizDir = s.outputDir.resolve("radial_visualisation_new");
        if (!Files.exists(vizDir)) return null;
        try (Stream<Path> stream = Files.list(vizDir)) {
            return stream
                .filter(p -> p.toString().endsWith(".png"))
                .map(p -> p.getFileName().toString())
                .sorted()
                .collect(java.util.stream.Collectors.toList());
        } catch (IOException e) {
            return null;
        }
    }

    public java.io.File getBfImageFile(String jobId, String filename) {
        JobState s = jobs.get(jobId);
        if (s == null || s.outputDir == null) return null;
        Path p = s.outputDir.resolve("radial_visualisation_new").resolve(filename);
        return Files.exists(p) ? p.toFile() : null;
    }

    private void runGenerateVizData(JobState state) {
        try {
            String python     = resolvePython();
            String scriptPath = resolveVizDataScript();
            ProcessBuilder pb = new ProcessBuilder(
                "python3", scriptPath,
                state.outputDir.toAbsolutePath().toString(),
                "--num_agents",      String.valueOf(state.numAgents),
                "--num_plans",       String.valueOf(state.numPlans),
                "--num_iterations",  String.valueOf(state.numIterations),
                "--num_children",    String.valueOf(state.numChildren),
                "--alpha",           String.valueOf(state.alpha),
                "--beta",            String.valueOf(state.beta),
                "--num_simulations", String.valueOf(state.numSimulations),
                "--algorithm",       state.algorithm != null ? state.algorithm : "EPOS"
            );
            pb.redirectErrorStream(true);
            Process proc = pb.start();
            proc.getInputStream().readAllBytes(); // drain
            proc.waitFor();
        } catch (Exception e) {
            System.err.println("Warning: Failed to generate visualization data: " + e.getMessage());
            e.printStackTrace();
            // Non-fatal: EPOS results are still available without viz data
        }
    }

    private String resolveVizDataScript() {
        File docker      = new File("/app/scripts/generate_viz_data.py");
        if (docker.exists()) return docker.getAbsolutePath();
        File local       = new File("scripts/generate_viz_data.py");
        if (local.exists()) return local.getAbsolutePath();
        File fromBackend = new File("../scripts/generate_viz_data.py");
        if (fromBackend.exists()) return fromBackend.getAbsolutePath();
        throw new RuntimeException("generate_viz_data.py not found");
    }

    // ── Privacy dataset ───────────────────────────────────────────────────────

    private void copyPrivacyFiles(Path datasetDir) throws IOException {
        for (int i = 0; i < 6; i++) {
            String name = "agent_" + i + ".plans";
            try (InputStream is = getClass().getClassLoader()
                    .getResourceAsStream("privacy-agents/" + name)) {
                if (is != null)
                    Files.copy(is, datasetDir.resolve(name), StandardCopyOption.REPLACE_EXISTING);
            }
        }
        try (InputStream is = getClass().getClassLoader()
                .getResourceAsStream("privacy-agents/privacy-goal-very-high.target")) {
            if (is != null)
                Files.copy(is, datasetDir.resolve("zero.target"), StandardCopyOption.REPLACE_EXISTING);
        }
    }

    public List<Map<String, Object>> getPrivacyDataset() throws IOException {
        List<Map<String, Object>> agents = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            String name = "agent_" + i + ".plans";
            try (InputStream is = getClass().getClassLoader()
                    .getResourceAsStream("privacy-agents/" + name)) {
                if (is == null) continue;
                String content = new String(is.readAllBytes());
                List<Map<String, Object>> plans = new ArrayList<>();
                for (String line : content.split("\n")) {
                    line = line.trim();
                    if (line.isEmpty()) continue;
                    String[] parts = line.split(":", 2);
                    double cost = Double.parseDouble(parts[0]);
                    double[] values = Arrays.stream(parts[1].split(","))
                            .mapToDouble(Double::parseDouble).toArray();
                    plans.add(Map.of("cost", cost, "values", values));
                }
                Map<String, Object> agent = new LinkedHashMap<>();
                agent.put("name", "agent_" + i);
                agent.put("plans", plans);
                agents.add(agent);
            }
        }
        return agents;
    }

    // ── Path resolution ───────────────────────────────────────────────────────

    private String resolveJarPath() {
        String env = System.getenv("EPOS_JAR");
        if (env != null && new File(env).exists()) return env;
        File fromRoot    = new File("target/tutorial-0.0.1.jar");
        if (fromRoot.exists()) return fromRoot.getAbsolutePath();
        File fromBackend = new File("../target/tutorial-0.0.1.jar");
        if (fromBackend.exists()) return fromBackend.getAbsolutePath();
        File rel = new File("epos.jar");
        if (rel.exists()) return rel.getAbsolutePath();
        return "/app/epos.jar";
    }

    private String resolvePythonScript() {
        File docker      = new File("/app/mathematical_way/run_experiment.py");
        if (docker.exists()) return docker.getAbsolutePath();
        File local       = new File("mathematical_way/run_experiment.py");
        if (local.exists()) return local.getAbsolutePath();
        File fromBackend = new File("../mathematical_way/run_experiment.py");
        if (fromBackend.exists()) return fromBackend.getAbsolutePath();
        throw new RuntimeException("run_experiment.py not found");
    }

    private String resolvePython() {
        for (String cmd : new String[]{"venv/bin/python3", "python3", "python"}) {
            try {
                String actualCmd = cmd;
                if ("venv/bin/python3".equals(cmd)) {
                    File venvPy = new File("venv/bin/python3");
                    if (venvPy.exists()) {
                        actualCmd = venvPy.getAbsolutePath();
                    } else {
                        File siblingVenv = new File("../venv/bin/python3");
                        if (siblingVenv.exists()) {
                            actualCmd = siblingVenv.getAbsolutePath();
                        }
                    }
                }
                int code = new ProcessBuilder(actualCmd, "--version")
                        .redirectErrorStream(true).start().waitFor();
                if (code == 0) return actualCmd;
            } catch (Exception ignored) {}
        }
        return "python3";
    }

    // ── Status / Results / Cleanup ────────────────────────────────────────────

    public Map<String, Object> getStatus(String jobId) {
        JobState s = jobs.get(jobId);
        if (s == null) return Map.of("status", "NOT_FOUND", "jobId", jobId);
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("jobId", jobId);
        resp.put("status", s.status);
        if (s.currentPhase != null) resp.put("currentPhase", s.currentPhase);
        if (s.error != null) resp.put("error", s.error);
        return resp;
    }

    public Map<String, Object> getResults(String jobId) {
        JobState s = jobs.get(jobId);
        if (s == null) return Map.of("error", "Job not found", "jobId", jobId);
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("jobId", jobId);
        resp.put("status", s.status);
        if (s.error   != null) resp.put("error",  s.error);
        if (s.logs    != null) resp.put("logs",    s.logs);
        if (s.results != null) resp.putAll(s.results);
        return resp;
    }

    public void cleanup(String jobId) {
        JobState s = jobs.remove(jobId);
        if (s != null && s.workDir != null) {
            try {
                Files.walk(s.workDir).sorted(Comparator.reverseOrder())
                     .forEach(p -> { try { Files.delete(p); } catch (IOException ignored) {} });
            } catch (IOException ignored) {}
        }
    }

    public boolean killJob(String jobId) {
        JobState s = jobs.get(jobId);
        if (s == null) return false;
        s.wasKilled = true;
        if (s.process != null && s.process.isAlive()) {
            s.process.destroy();
            return true;
        }
        return false;
    }

    public Map<String, String> getAvailableSignals() {
        Map<String, String> signals = new LinkedHashMap<>();
        signals.put("linear-increase", "0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99");
        signals.put("sine-wave", "0.0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0,0.9,0.8,0.7,0.6,0.5,0.4,0.3,0.2,0.1,0.0,-0.1,-0.2,-0.3,-0.4,-0.5,-0.6,-0.7,-0.8,-0.9,-1.0,-0.9,-0.8,-0.7,-0.6,-0.5,-0.4,-0.3,-0.2,-0.1,0.0");
        signals.put("zero", "0.0");

        // Gaussian-specific signal
        File baseDir = resolveDatasetsDir();
        File gaussianTarget = new File(baseDir, "gaussian_full/gaussian.target");
        if (gaussianTarget.exists()) {
            try { signals.put("gaussian", Files.readString(gaussianTarget.toPath()).trim()); }
            catch (IOException ignored) {}
        }

        // Privacy-specific signal
        try (InputStream is = getClass().getClassLoader().getResourceAsStream("privacy-agents/privacy-goal-very-high.target")) {
            if (is != null) {
                signals.put("privacy-goal-very-high", new String(is.readAllBytes()).trim());
            }
        } catch (IOException ignored) {}

        return signals;
    }

    private File resolveDatasetsDir() {
        String env = System.getenv("EPOS_DATASETS");
        if (env != null && !env.isBlank()) {
            File f = new File(env);
            if (f.exists() && f.isDirectory()) return f;
        }
        File baseDir = new File("datasets");
        if (baseDir.exists() && baseDir.isDirectory()) return baseDir;
        baseDir = new File("../datasets");
        if (baseDir.exists() && baseDir.isDirectory()) return baseDir;
        return new File("datasets"); // fallback
    }

    public List<String> listAvailableDatasets() {
        if (cachedDatasetList != null) return cachedDatasetList;
        List<String> result = new ArrayList<>();
        File baseDir = resolveDatasetsDir();
        if (!baseDir.exists() || !baseDir.isDirectory()) {
            return result;
        }
        scanForDatasetFolders(baseDir, baseDir, result);
        Collections.sort(result);
        cachedDatasetList = Collections.unmodifiableList(result);
        return cachedDatasetList;
    }

    private void scanForDatasetFolders(File baseDir, File currentDir, List<String> result) {
        File[] files = currentDir.listFiles();
        if (files == null) return;
        boolean hasPlans = false;
        for (File f : files) {
            if (f.isFile() && f.getName().endsWith(".plans")) {
                hasPlans = true;
                break;
            }
        }
        if (hasPlans) {
            String rel = baseDir.toURI().relativize(currentDir.toURI()).getPath();
            if (rel.endsWith("/")) {
                rel = rel.substring(0, rel.length() - 1);
            }
            if (!rel.isEmpty() && !result.contains(rel)) {
                result.add(rel);
            }
        }
        for (File f : files) {
            if (f.isDirectory() && !f.getName().equals("__MACOSX")) {
                scanForDatasetFolders(baseDir, f, result);
            }
        }
    }

    public String getDatasetRawJson(String relPath) throws IOException {
        String cached = datasetJsonCache.get(relPath);
        if (cached != null) return cached;
        File baseDir = resolveDatasetsDir();
        File prebuilt = new File(new File(baseDir, relPath), "dataset.json");
        if (prebuilt.exists()) {
            String json = Files.readString(prebuilt.toPath());
            datasetJsonCache.put(relPath, json);
            return json;
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> loadDataset(String relPath) throws IOException {
        File baseDir = resolveDatasetsDir();
        File targetDir = new File(baseDir, relPath);
        if (!targetDir.getCanonicalPath().startsWith(baseDir.getCanonicalPath())) {
            throw new IllegalArgumentException("Invalid dataset path");
        }
        if (!targetDir.exists() || !targetDir.isDirectory()) {
            return new ArrayList<>();
        }

        // Fast path: use pre-built dataset.json with in-memory cache
        File prebuilt = new File(targetDir, "dataset.json");
        if (prebuilt.exists()) {
            String json = datasetJsonCache.get(relPath);
            if (json == null) {
                json = Files.readString(prebuilt.toPath());
                datasetJsonCache.put(relPath, json);
            }
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            return mapper.readValue(json, new com.fasterxml.jackson.core.type.TypeReference<List<Map<String, Object>>>() {});
        }

        // Slow path: parse individual .plans files
        List<Map<String, Object>> agents = new ArrayList<>();
        File[] files = targetDir.listFiles((dir, name) -> name.endsWith(".plans"));
        if (files == null) return agents;

        Arrays.sort(files, (f1, f2) -> {
            String n1 = f1.getName().replaceAll("[^0-9]", "");
            String n2 = f2.getName().replaceAll("[^0-9]", "");
            if (!n1.isEmpty() && !n2.isEmpty()) {
                try {
                    return Integer.compare(Integer.parseInt(n1), Integer.parseInt(n2));
                } catch (NumberFormatException ignored) {}
            }
            return f1.getName().compareTo(f2.getName());
        });

        for (File f : files) {
            String name = f.getName().replace(".plans", "");
            String content = Files.readString(f.toPath());
            List<Map<String, Object>> plans = new ArrayList<>();
            for (String line : content.split("\n")) {
                line = line.trim();
                if (line.isEmpty()) continue;
                String[] parts = line.split(":", 2);
                if (parts.length < 2) continue;
                try {
                    double cost = Double.parseDouble(parts[0]);
                    double[] values = Arrays.stream(parts[1].split(","))
                            .mapToDouble(Double::parseDouble).toArray();
                    plans.add(Map.of("cost", cost, "values", values));
                } catch (NumberFormatException ignored) {}
            }
            Map<String, Object> agent = new LinkedHashMap<>();
            agent.put("name", name);
            agent.put("plans", plans);
            agents.add(agent);
        }
        return agents;
    }

    public Map<String, Object> getDatasetMetadata(String relPath) throws IOException {
        File baseDir = resolveDatasetsDir();
        File targetDir = new File(baseDir, relPath);
        if (!targetDir.getCanonicalPath().startsWith(baseDir.getCanonicalPath())) {
            throw new IllegalArgumentException("Invalid dataset path");
        }
        if (!targetDir.exists() || !targetDir.isDirectory()) {
            return Map.of();
        }

        File[] files = targetDir.listFiles((dir, name) -> name.endsWith(".plans"));
        if (files == null || files.length == 0) return Map.of();

        Arrays.sort(files, (f1, f2) -> {
            String n1 = f1.getName().replaceAll("[^0-9]", "");
            String n2 = f2.getName().replaceAll("[^0-9]", "");
            if (!n1.isEmpty() && !n2.isEmpty()) {
                try { return Integer.compare(Integer.parseInt(n1), Integer.parseInt(n2)); }
                catch (NumberFormatException ignored) {}
            }
            return f1.getName().compareTo(f2.getName());
        });

        List<String> agentNames = new ArrayList<>();
        for (File f : files) {
            agentNames.add(f.getName().replace(".plans", ""));
        }

        int numPlans = 0;
        int planDim = 0;
        for (String line : Files.readString(files[0].toPath()).split("\n")) {
            String trimmed = line.trim();
            if (trimmed.isEmpty()) continue;
            numPlans++;
            if (planDim == 0) {
                String[] parts = trimmed.split(":", 2);
                if (parts.length == 2) planDim = parts[1].split(",").length;
            }
        }

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("numAgents", files.length);
        meta.put("numPlans", numPlans);
        meta.put("planDim", planDim);
        meta.put("agentNames", agentNames);
        return meta;
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> loadSelectedAgents(String relPath, List<String> agentNames) throws IOException {
        // Fast path: filter from pre-built JSON cache
        String rawJson = getDatasetRawJson(relPath);
        if (rawJson != null) {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            List<Map<String, Object>> all = mapper.readValue(rawJson,
                    new com.fasterxml.jackson.core.type.TypeReference<List<Map<String, Object>>>() {});
            Set<String> nameSet = new HashSet<>(agentNames);
            List<Map<String, Object>> filtered = new ArrayList<>();
            for (Map<String, Object> agent : all) {
                if (nameSet.contains(agent.get("name"))) filtered.add(agent);
            }
            return filtered;
        }

        // Slow path: read individual .plans files
        File baseDir = resolveDatasetsDir();
        File targetDir = new File(baseDir, relPath);
        if (!targetDir.getCanonicalPath().startsWith(baseDir.getCanonicalPath())) {
            throw new IllegalArgumentException("Invalid dataset path");
        }

        List<Map<String, Object>> agents = new ArrayList<>();
        for (String name : agentNames) {
            if (name.contains("/") || name.contains("\\") || name.contains("..")) {
                throw new IllegalArgumentException("Invalid agent name");
            }
            File f = new File(targetDir, name + ".plans");
            if (!f.exists() || !f.getCanonicalPath().startsWith(targetDir.getCanonicalPath())) {
                continue;
            }
            String content = Files.readString(f.toPath());
            List<Map<String, Object>> plans = new ArrayList<>();
            for (String line : content.split("\n")) {
                line = line.trim();
                if (line.isEmpty()) continue;
                String[] parts = line.split(":", 2);
                if (parts.length < 2) continue;
                try {
                    double cost = Double.parseDouble(parts[0]);
                    double[] values = Arrays.stream(parts[1].split(","))
                            .mapToDouble(Double::parseDouble).toArray();
                    plans.add(Map.of("cost", cost, "values", values));
                } catch (NumberFormatException ignored) {}
            }
            Map<String, Object> agent = new LinkedHashMap<>();
            agent.put("name", name);
            agent.put("plans", plans);
            agents.add(agent);
        }
        return agents;
    }

    public Map<String, Object> checkCache(MultipartFile[] files, RunRequest req) {
        String configKey = getConfigKey(files, req);
        CachedResults cached = cache.get(configKey);
        if (cached == null) {
            return Map.of("exists", false);
        }

        boolean hasEpos = cached.results.containsKey("global-cost");
        boolean hasBf = cached.results.containsKey("solutionwiseresults");

        boolean requestedEpos = "EPOS".equalsIgnoreCase(req.algorithm);
        boolean requestedBf = "BRUTE_FORCE".equalsIgnoreCase(req.algorithm);
        boolean requestedBoth = "BOTH".equalsIgnoreCase(req.algorithm);

        boolean match = (requestedEpos && hasEpos) ||
                        (requestedBf && hasBf) ||
                        (requestedBoth && hasEpos && hasBf);

        if (!match) {
            return Map.of("exists", false);
        }

        // Return a mocked successful response containing the results and details!
        String dummyJobId = "cached-" + UUID.nameUUIDFromBytes(configKey.getBytes()).toString();
        
        // Put a temporary JobState in jobs map so endpoints find it
        JobState state = new JobState(dummyJobId, null);
        state.status = "COMPLETED";
        state.algorithm = req.algorithm;
        state.numAgents = req.numAgents > 0 ? req.numAgents : (files != null ? files.length : 0);
        state.numPlans = req.numPlans;
        state.numIterations = req.numIterations;
        state.numChildren = req.numChildren;
        state.numSimulations = req.numSimulations;
        state.alpha = req.alpha;
        state.beta = req.beta;
        state.logs = cached.logs;
        state.cachedIterationHistory = cached.iterationHistory;
        state.cachedVizData = cached.vizData;

        // Populate results map with only the requested algorithm's results, or both!
        Map<String, Object> filteredResults = new LinkedHashMap<>();
        if (requestedEpos || requestedBoth) {
            for (String key : new String[]{"global-cost", "unfairness", "local-cost", "global-complex-cost", "selected-plans", "indexes-histogram", "termination"}) {
                if (cached.results.containsKey(key)) {
                    filteredResults.put(key, cached.results.get(key));
                }
            }
        }
        if (requestedBf || requestedBoth) {
            for (String key : new String[]{"solutionwiseresults", "epossimulationresults", "summary"}) {
                if (cached.results.containsKey(key)) {
                    filteredResults.put(key, cached.results.get(key));
                }
            }
        }
        state.results = filteredResults;
        jobs.put(dummyJobId, state);

        return Map.of(
            "exists", true,
            "jobId", dummyJobId,
            "status", "COMPLETED",
            "results", filteredResults,
            "logs", cached.logs
        );
    }
}
