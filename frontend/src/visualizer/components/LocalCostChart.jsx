/**
 * LocalCostChart.jsx
 * D3 bar/line chart showing per-agent local cost for the active iteration.
 * Agents are sorted in descending order of local cost so the plotted line
 * shows a decreasing (negative slope) trend.
 */
import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import styles from "./LocalCostChart.module.css";

/**
 * @param {Object}   props.experiment       – full experiment object
 * @param {number[]} props.activeIterations – array of currently highlighted iterations
 */
export default function LocalCostChart({ experiment, activeIterations = [] }) {
  const svgRef = useRef(null);
  const wrapperRef = useRef(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  // Responsive sizing via ResizeObserver
  useEffect(() => {
    if (!wrapperRef.current) return;
    const obs = new ResizeObserver((entries) => {
      setDims({
        w: entries[0].contentRect.width,
        h: entries[0].contentRect.height,
      });
    });
    obs.observe(wrapperRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const W = dims.w > 0 ? dims.w : wrapperRef.current?.clientWidth || 400;
    const H = dims.h > 0 ? dims.h : wrapperRef.current?.clientHeight || 130;

    if (!experiment || !svgRef.current || W === 0 || H === 0) return;

    // Get the current iteration's agent data
    const iterIdx = activeIterations[0] ?? 0;
    const iterData = experiment.iterations?.[iterIdx];
    if (!iterData) return;

    // Sort agents by local cost descending (highest first → decreasing line)
    const agents = [...iterData.agents].sort(
      (a, b) => b.localCost - a.localCost,
    );

    const margin = { top: 14, right: 20, bottom: 28, left: 50 };
    const innerW = W - margin.left - margin.right;
    const innerH = H - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", W).attr("height", H);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3
      .scaleLinear()
      .domain([0, agents.length - 1])
      .range([0, innerW]);

    const [minCost, maxCost] = d3.extent(agents, (d) => d.localCost);
    const yPad = (maxCost - minCost) * 0.08 || 0.01;
    const yScale = d3
      .scaleLinear()
      .domain([minCost - yPad, maxCost + yPad])
      .range([innerH, 0]);

    // Gradient fill
    const gradId = `local-cost-grad-${experiment.id.replace(/[^a-z0-9]/gi, "")}`;
    const defs = svg.append("defs");
    const grad = defs
      .append("linearGradient")
      .attr("id", gradId)
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", 0)
      .attr("y2", 1);
    grad
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#ffffff")
      .attr("stop-opacity", 0.35);
    grad
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#ffffff")
      .attr("stop-opacity", 0);

    // Area fill
    const area = d3
      .area()
      .x((d, i) => xScale(i))
      .y0(innerH)
      .y1((d) => yScale(d.localCost))
      .curve(d3.curveMonotoneX);
    g.append("path").datum(agents).attr("d", area).attr("fill", `url(#${gradId})`);

    // Line
    const line = d3
      .line()
      .x((d, i) => xScale(i))
      .y((d) => yScale(d.localCost))
      .curve(d3.curveMonotoneX);
    g.append("path")
      .datum(agents)
      .attr("d", line)
      .attr("fill", "none")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 2);

    // Data points
    g.selectAll(".dot")
      .data(agents)
      .enter()
      .append("circle")
      .attr("cx", (d, i) => xScale(i))
      .attr("cy", (d) => yScale(d.localCost))
      .attr("r", 3)
      .attr("fill", "#ffffff")
      .attr("stroke", "#192923")
      .attr("stroke-width", 1.5);

    // X axis
    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(Math.min(agents.length, 10))
          .tickFormat((d) => {
            const agent = agents[Math.round(d)];
            return agent ? `${agent.id}` : "";
          }),
      )
      .call((ax) => {
        ax.select(".domain").attr("stroke", "rgba(255,255,255,0.1)");
        ax.selectAll("line").attr("stroke", "rgba(255,255,255,0.1)");
        ax.selectAll("text").attr("fill", "#4a5280").attr("font-size", "11px");
      });
    g.append("text")
      .attr("x", innerW / 2)
      .attr("y", innerH + 26)
      .attr("text-anchor", "middle")
      .attr("fill", "#4a5280")
      .attr("font-size", "11px")
      .text("Agents (sorted)");

    // Y axis
    g.append("g")
      .call(d3.axisLeft(yScale).ticks(4).tickFormat(d3.format(".2f")))
      .call((ax) => {
        ax.select(".domain").attr("stroke", "rgba(255,255,255,0.1)");
        ax.selectAll("line").attr("stroke", "rgba(255,255,255,0.1)");
        ax.selectAll("text").attr("fill", "#4a5280").attr("font-size", "11px");
      });
    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerH / 2)
      .attr("y", -42)
      .attr("text-anchor", "middle")
      .attr("fill", "#4a5280")
      .attr("font-size", "11px")
      .text("Local Cost");
  }, [experiment, activeIterations, dims]);

  if (!experiment) return null;

  return (
    <div className={`glass ${styles.wrapper}`}>
      <div className={styles.title}>Local Cost vs Agents</div>
      <div className={styles.chartWrapper} ref={wrapperRef}>
        <svg ref={svgRef} className={styles.chart} />
      </div>
    </div>
  );
}
