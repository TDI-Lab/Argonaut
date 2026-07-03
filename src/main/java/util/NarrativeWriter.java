package util;

import java.io.BufferedWriter;
import java.io.FileWriter;
import java.io.IOException;
import java.io.PrintWriter;
import config.Configuration;

public class NarrativeWriter {
    private static final String FILENAME = "algorithm_log.txt";
    private static boolean enabled = false;

    public static void setEnabled(boolean enabled) {
        NarrativeWriter.enabled = enabled;
    }

    public static boolean isEnabled() {
        return enabled;
    }

    public static synchronized void write(String message) {
        if (!enabled) {
            return;
        }
        try (PrintWriter out = new PrintWriter(new BufferedWriter(new FileWriter(FILENAME, true)))) {
            out.println(message);
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    public static void clear() {
        if (!enabled) {
            return;
        }
        try (PrintWriter out = new PrintWriter(new BufferedWriter(new FileWriter(FILENAME)))) {
            out.print("");
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
}