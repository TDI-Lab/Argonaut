package com.epos.api.model;

public class RunRequest {
    public int numAgents;
    public int numPlans = 10;
    public int planDim = 100;
    public int numIterations = 40;
    public int numChildren = 2;
    public int numSimulations = 1;
    public double alpha = 0.0;
    public double beta = 0.0;
    public String globalCostFunction = "VAR";
    public String localCostFunction = "INDEX";
    public String goalSignal = "";
    public String algorithm = "EPOS";       // EPOS | BRUTE_FORCE
    public String datasetType = "upload";   // upload | privacy
}
