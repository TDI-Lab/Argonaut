/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
package func;

import config.Configuration;
import data.Vector;

/**
 * Computes the dot product of a cost vector and the given input vector in 
 * a non thread safe way. This can be used when the objective includes the calculation of
 * he dot product between vectors.
 * 
 * @author Peter, Thomas Asikis
 */
public class CustomCostFunction implements DifferentiableCostFunction<Vector>, HasGoal {
    private Vector costVector;
    
    /**
     * Sets the cost vector in a non thread safe way.
     * This cost vector will be used to calculate the 
     * dot product each time the {@code calcCost} is called.
     * @param costVector the cost vector
     */
    public void setCostVector(Vector costVector) {
        this.costVector = costVector;
    }

    @Override
    public Vector calcGradient(Vector value) {
        return costVector;
    }

    @Override
    public double calcCost(Vector value) {
        return costVector.dot(value);
    }

    @Override
    public void logCostCalculation(Vector vector, StringBuilder sbLog) {
        sbLog.append("    |    [Global Cost Breakdown: Dot Product]\n");
        sbLog.append("    |    Cost Vector (Goal) . Global Response\n");
        
        double dotProd = 0;
        sbLog.append("    |    = ");
        
        int limit = Math.min(3, vector.getNumDimensions());
        for (int i = 0; i < limit; i++) {
            double v1 = this.costVector.getValue(i);
            double v2 = vector.getValue(i);
            dotProd += v1 * v2;
            sbLog.append(String.format("(%.2f * %.2f) + ", v1, v2));
        }
        if (vector.getNumDimensions() > limit) {
            sbLog.append("... + ");
        }
        
        for (int i = limit; i < vector.getNumDimensions(); i++) {
             dotProd += this.costVector.getValue(i) * vector.getValue(i);
        }
        
        sbLog.append("\n");
        sbLog.append(String.format("    |    Total Dot Product = %.6f\n", dotProd));
    }

    @Override
    public String toString() {
        return "custom cost function: mod dot product";
    }

	@Override
	public void populateGoalSignal() {
		this.costVector = Configuration.goalSignalSupplier.get();
		for(int i = 0; i < this.costVector.getNumDimensions(); i++){
			double val = this.costVector.getValue(i);
			if(val < 0) {
				this.costVector.setValue(i, (-1)*val);
			}
		}
	}
	
	@Override
	public String getLabel() {
		return "CCF";
	}
    
}
