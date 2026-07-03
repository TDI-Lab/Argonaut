package com.epos.api.model;

import java.nio.file.Path;
import java.util.Map;

public class JobState {
    public String jobId;
    public String status; // QUEUED, RUNNING, COMPLETED, FAILED
    public Path workDir;
    public Path outputDir;   // output dir for viz data (both EPOS and brute-force)
    public String currentPhase; // EPOS, BRUTE_FORCE
    public String logs;
    public String error;
    public Map<String, Object> results;
    public transient Process process;
    public boolean wasKilled = false;

    // Cached iteration history and viz data (experiments.json)
    public String cachedIterationHistory;
    public String cachedVizData;

    // EPOS config — stored so generate_viz_data.py can be called after the run
    public String algorithm;
    public int    numAgents;
    public int    numPlans;
    public int    numIterations;
    public int    numChildren;
    public int    numSimulations;
    public double alpha;
    public double beta;

    public JobState(String jobId, Path workDir) {
        this.jobId = jobId;
        this.workDir = workDir;
        this.status = "QUEUED";
    }
}
