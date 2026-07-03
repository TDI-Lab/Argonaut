/*
 * Copyright (C) 2016 Evangelos Pournaras
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA  02111-1307, USA.
 */
package func;

import data.Vector;

/**
 * The cost according to this cost function is the variance of the elements of
 * the given vector. This cost function can be used for load balancing, for
 * example.
 *
 * @author Peter
 */
public class VarCostFunction implements DifferentiableCostFunction<Vector> {

    @Override
    public double calcCost(Vector vector) {
        return vector.variance();
    }

    @Override
    public void logCostCalculation(Vector vector, StringBuilder sbLog) {
        sbLog.append("    |    [Global Cost Breakdown: Variance]\n");
        sbLog.append("    |    Formula: Variance = Sum((x_i - mean)^2) / N\n");
        double average = vector.avg();
        sbLog.append(String.format("    |    Mean = %.6f\n", average));
        
        double sumSquare = 0.0;
        sbLog.append("    |    SumSq = ");
        
        int limit = Math.min(3, vector.getNumDimensions());
        for (int i = 0; i < limit; i++) {
            double val = vector.getValue(i);
            double diff = val - average;
            sumSquare += Math.pow(diff, 2.0);
            sbLog.append(String.format("(%.2f - %.2f)^2 + ", val, average));
        }
        if (vector.getNumDimensions() > limit) {
            sbLog.append("... + ");
        }
        
        for (int i = limit; i < vector.getNumDimensions(); i++) {
            double val = vector.getValue(i);
            sumSquare += Math.pow((val - average), 2.0);
        }
        
        sbLog.append("\n");
        sbLog.append(String.format("    |    Total SumSq = %.6f\n", sumSquare));
        sbLog.append(String.format("    |    Variance = SumSq / N = %.6f / %d = %.6f\n", sumSquare, vector.getNumDimensions(), sumSquare / vector.getNumDimensions()));
    }

    @Override
    public Vector calcGradient(Vector vector) {
        Vector v = vector.cloneThis();
        v.subtract(v.avg());
        v.multiply(2.0 / (v.getNumDimensions() - 1));
        return v;
    }

    @Override
    public String toString() {
        return "variance";
    }
    @Override
    public String getLabel() {
    	// TODO Auto-generated method stub
    	return "VAR";
    }
}
