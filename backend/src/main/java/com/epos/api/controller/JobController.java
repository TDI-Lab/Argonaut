package com.epos.api.controller;

import com.epos.api.model.RunRequest;
import com.epos.api.service.JobService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.MediaType;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class JobController {

    @Autowired
    private JobService jobService;

    @PostMapping("/run")
    public ResponseEntity<Map<String, Object>> run(
            @RequestParam(value = "files", required = false) MultipartFile[] files,
            @RequestParam(value = "numAgents",          defaultValue = "0")       int numAgents,
            @RequestParam(value = "numPlans",           defaultValue = "10")      int numPlans,
            @RequestParam(value = "planDim",            defaultValue = "100")     int planDim,
            @RequestParam(value = "numIterations",      defaultValue = "40")      int numIterations,
            @RequestParam(value = "numChildren",        defaultValue = "2")       int numChildren,
            @RequestParam(value = "numSimulations",     defaultValue = "1")       int numSimulations,
            @RequestParam(value = "alpha",              defaultValue = "0.0")     double alpha,
            @RequestParam(value = "beta",               defaultValue = "0.0")     double beta,
            @RequestParam(value = "globalCostFunction", defaultValue = "VAR")     String globalCostFunction,
            @RequestParam(value = "localCostFunction",  defaultValue = "INDEX")   String localCostFunction,
            @RequestParam(value = "goalSignal",         defaultValue = "")        String goalSignal,
            @RequestParam(value = "algorithm",          defaultValue = "EPOS")    String algorithm,
            @RequestParam(value = "datasetType",        defaultValue = "upload")  String datasetType
    ) {
        if (files == null || files.length == 0) {
            return ResponseEntity.badRequest().body(Map.of("error", "No plan files uploaded."));
        }

        if (numAgents > 0 && numAgents != files.length) {
            return ResponseEntity.badRequest().body(Map.of("error", "The number of agents (" + numAgents + ") does not match the number of uploaded plans files (" + files.length + ")."));
        }

        if (numPlans > 0) {
            for (MultipartFile file : files) {
                if (file == null || file.isEmpty()) continue;
                try {
                    String content = new String(file.getBytes());
                    int lineCount = 0;
                    for (String line : content.split("\n")) {
                        if (line != null && !line.trim().isEmpty()) {
                            lineCount++;
                            if (planDim > 0) {
                                String[] parts = line.trim().split(":");
                                if (parts.length > 1) {
                                    String[] values = parts[1].split(",");
                                    if (values.length != planDim) {
                                        return ResponseEntity.badRequest().body(Map.of(
                                            "error", "Plan dimension in " + file.getOriginalFilename() + " (" + values.length + ") does not match configured dimension (" + planDim + ")."
                                        ));
                                    }
                                }
                            }
                        }
                    }
                    if (lineCount != numPlans) {
                        return ResponseEntity.badRequest().body(Map.of(
                            "error", "The number of plans in " + file.getOriginalFilename() + " (" + lineCount + ") does not match the configured plans per agent (" + numPlans + ")."
                        ));
                    }
                } catch (IOException e) {
                    // ignore
                }
            }
        }

        RunRequest req = new RunRequest();
        req.numAgents          = numAgents;
        req.numPlans           = numPlans;
        req.planDim            = planDim;
        req.numIterations      = numIterations;
        req.numChildren        = numChildren;
        req.numSimulations     = numSimulations;
        req.alpha              = alpha;
        req.beta               = beta;
        req.globalCostFunction = globalCostFunction;
        req.localCostFunction  = localCostFunction;
        req.goalSignal         = goalSignal;
        req.algorithm          = algorithm;
        req.datasetType        = datasetType;

        try {
            String jobId = jobService.submitJob(files, req);
            return ResponseEntity.ok(Map.of("jobId", jobId, "status", "RUNNING"));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to create job: " + e.getMessage()));
        }
    }

    @PostMapping("/check-cache")
    public ResponseEntity<Map<String, Object>> checkCache(
            @RequestParam(value = "files", required = false) MultipartFile[] files,
            @RequestParam(value = "numAgents",          defaultValue = "0")       int numAgents,
            @RequestParam(value = "numPlans",           defaultValue = "10")      int numPlans,
            @RequestParam(value = "planDim",            defaultValue = "100")     int planDim,
            @RequestParam(value = "numIterations",      defaultValue = "40")      int numIterations,
            @RequestParam(value = "numChildren",        defaultValue = "2")       int numChildren,
            @RequestParam(value = "numSimulations",     defaultValue = "1")       int numSimulations,
            @RequestParam(value = "alpha",              defaultValue = "0.0")     double alpha,
            @RequestParam(value = "beta",               defaultValue = "0.0")     double beta,
            @RequestParam(value = "globalCostFunction", defaultValue = "VAR")     String globalCostFunction,
            @RequestParam(value = "localCostFunction",  defaultValue = "INDEX")   String localCostFunction,
            @RequestParam(value = "goalSignal",         defaultValue = "")        String goalSignal,
            @RequestParam(value = "algorithm",          defaultValue = "EPOS")    String algorithm,
            @RequestParam(value = "datasetType",        defaultValue = "upload")  String datasetType
    ) {
        if (files == null || files.length == 0) {
            return ResponseEntity.ok(Map.of("exists", false));
        }

        RunRequest req = new RunRequest();
        req.numAgents          = numAgents <= 0 ? files.length : numAgents;
        req.numPlans           = numPlans;
        req.planDim            = planDim;
        req.numIterations      = numIterations;
        req.numChildren        = numChildren;
        req.numSimulations     = numSimulations;
        req.alpha              = alpha;
        req.beta               = beta;
        req.globalCostFunction = globalCostFunction;
        req.localCostFunction  = localCostFunction;
        req.goalSignal         = goalSignal;
        req.algorithm          = algorithm;
        req.datasetType        = datasetType;

        return ResponseEntity.ok(jobService.checkCache(files, req));
    }

    @GetMapping("/status/{jobId}")
    public ResponseEntity<Map<String, Object>> status(@PathVariable String jobId) {
        return ResponseEntity.ok(jobService.getStatus(jobId));
    }

    @GetMapping("/results/{jobId}")
    public ResponseEntity<Map<String, Object>> results(@PathVariable String jobId) {
        return ResponseEntity.ok(jobService.getResults(jobId));
    }

    @DeleteMapping("/jobs/{jobId}")
    public ResponseEntity<Void> cleanup(@PathVariable String jobId) {
        jobService.cleanup(jobId);
        return ResponseEntity.noContent().build();
    }

    /** Returns experiments.json for the EPOS Visualizer frontend component. */
    @GetMapping("/results/{jobId}/viz-data")
    public ResponseEntity<?> vizData(@PathVariable String jobId) {
        try {
            String json = jobService.getVizData(jobId);
            if (json == null) return ResponseEntity.notFound().build();
            return ResponseEntity.ok()
                    .header("Content-Type", "application/json")
                    .body(json);
        } catch (java.io.IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /** Returns iteration_cost_history.csv for brute-force tree visualisation. */
    @GetMapping("/results/{jobId}/iteration-history")
    public ResponseEntity<?> iterationHistory(@PathVariable String jobId) {
        try {
            String csv = jobService.getIterationHistory(jobId);
            if (csv == null) return ResponseEntity.notFound().build();
            return ResponseEntity.ok()
                    .header("Content-Type", "text/csv")
                    .body(csv);
        } catch (java.io.IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /** Returns list of brute-force visualization PNG filenames. */
    @GetMapping("/results/{jobId}/bf-images")
    public ResponseEntity<List<String>> bfImageList(@PathVariable String jobId) {
        List<String> images = jobService.getBfImageList(jobId);
        if (images == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(images);
    }

    /** Serves a single brute-force visualization PNG. */
    @GetMapping("/results/{jobId}/bf-images/{filename:.+}")
    public ResponseEntity<FileSystemResource> bfImage(
            @PathVariable String jobId, @PathVariable String filename) {
        java.io.File f = jobService.getBfImageFile(jobId, filename);
        if (f == null || !f.exists()) return ResponseEntity.notFound().build();
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_PNG)
                .body(new FileSystemResource(f));
    }

    /** Returns the privacy dataset plans as parsed JSON for the plan viewer. */
    @GetMapping("/dataset/privacy")
    public ResponseEntity<List<Map<String, Object>>> privacyDataset() {
        try {
            return ResponseEntity.ok(jobService.getPrivacyDataset());
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /** Returns list of available signal files and their values. */
    @GetMapping("/dataset/signals")
    public ResponseEntity<Map<String, String>> signals() {
        return ResponseEntity.ok(jobService.getAvailableSignals());
    }

    /** Returns list of available dataset subdirectories. */
    @GetMapping("/datasets")
    public ResponseEntity<List<String>> listDatasets() {
        return ResponseEntity.ok(jobService.listAvailableDatasets());
    }

    /** Loads and parses all .plans files in a given dataset subdirectory. */
    @GetMapping("/datasets/load")
    public ResponseEntity<?> loadDataset(@RequestParam("path") String path) {
        try {
            String rawJson = jobService.getDatasetRawJson(path);
            if (rawJson != null) {
                return ResponseEntity.ok()
                        .header("Content-Type", "application/json")
                        .body(rawJson);
            }
            return ResponseEntity.ok(jobService.loadDataset(path));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /** Returns lightweight metadata for a dataset (agent names, plan count, dimensions). */
    @GetMapping("/datasets/metadata")
    public ResponseEntity<Map<String, Object>> datasetMetadata(@RequestParam("path") String path) {
        try {
            return ResponseEntity.ok(jobService.getDatasetMetadata(path));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /** Loads plan data for specific agents only. */
    @PostMapping("/datasets/load-agents")
    public ResponseEntity<List<Map<String, Object>>> loadSelectedAgents(
            @RequestBody Map<String, Object> body) {
        try {
            String path = (String) body.get("path");
            @SuppressWarnings("unchecked")
            List<String> agentNames = (List<String>) body.get("agents");
            return ResponseEntity.ok(jobService.loadSelectedAgents(path, agentNames));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /** Kills a running job process. */
    @PostMapping("/jobs/{jobId}/kill")
    public ResponseEntity<Map<String, Object>> killJob(@PathVariable String jobId) {
        boolean success = jobService.killJob(jobId);
        if (success) {
            return ResponseEntity.ok(Map.of("message", "Job kill signal sent successfully."));
        } else {
            return ResponseEntity.notFound().build();
        }
    }
}

