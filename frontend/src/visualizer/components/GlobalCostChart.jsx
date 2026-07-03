/**
 * GlobalCostChart.jsx
 * D3 line chart showing global cost (root agent's complexCost) over all iterations.
 * Glowing dots mark the currently displayed iteration(s) [A and B].
 */
import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import styles from "./GlobalCostChart.module.css";

/**
 * @param {Object}   props.experiment       – full experiment object
 * @param {number[]} props.activeIterations – array of currently highlighted iterations
 * @param {Function} props.onIteration      – callback to jump to clicked iteration
 */
export default function GlobalCostChart({
  experiment,
  activeIterations = [],
  onIteration,
}) {
  const svgRef = useRef(null);
  const wrapperRef = useRef(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

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
    // Determine dimensions: If ResizeObserver returned 0 (e.g. initial render or flex collapse),
    // fallback to actual DOM bounds or hardcoded fallback.
    const W = dims.w > 0 ? dims.w : wrapperRef.current?.clientWidth || 600;
    const H = dims.h > 0 ? dims.h : wrapperRef.current?.clientHeight || 130;

    if (!experiment || !svgRef.current || W === 0 || H === 0) return;

    const margin = { top: 14, right: 20, bottom: 28, left: 45 };
    const innerW = W - margin.left - margin.right;
    const innerH = H - margin.top - margin.bottom;

    // Extract global cost over iterations (root agent's complexCost)
    const data = experiment.iterations
      .map((it) => {
        const rootCost = it.agents.reduce(
          (max, a) => Math.max(max, a.complexCost),
          0,
        );
        return { iter: it.iteration, cost: rootCost };
      })
      .slice(0, 10); // Limit to just 10 iterations

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", W).attr("height", H);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleLinear().domain([0, 9]).range([0, innerW]);
    const [minCost, maxCost] = d3.extent(data, (d) => d.cost);
    const yScale = d3
      .scaleLinear()
      .domain([minCost * 0.97, maxCost * 1.03])
      .range([innerH, 0]);

    // Gradient fill
    const gradId = `cost-grad-${experiment.id.replace(/[^a-z0-9]/gi, "")}`;
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
      .attr("stop-color", "#a4d673")
      .attr("stop-opacity", 0.4);
    grad
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#a4d673")
      .attr("stop-opacity", 0);

    // Area fill
    const area = d3
      .area()
      .x((d) => xScale(d.iter))
      .y0(innerH)
      .y1((d) => yScale(d.cost))
      .curve(d3.curveMonotoneX);
    g.append("path")
      .datum(data)
      .attr("d", area)
      .attr("fill", `url(#${gradId})`);

    // Line
    const line = d3
      .line()
      .x((d) => xScale(d.iter))
      .y((d) => yScale(d.cost))
      .curve(d3.curveMonotoneX);
    g.append("path")
      .datum(data)
      .attr("d", line)
      .attr("fill", "none")
      .attr("stroke", "#a4d673")
      .attr("stroke-width", 2);

    // X axis
    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(10)
          .tickFormat((d) => `${d}`),
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
      .text("Iteration");

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
      .text("Global Cost");

    // Key iteration markers
    experiment.keyIterations?.forEach((k) => {
      g.append("line")
        .attr("x1", xScale(k))
        .attr("x2", xScale(k))
        .attr("y1", 0)
        .attr("y2", innerH)
        .attr("stroke", "rgba(164,214,115,0.25)")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,3");
    });

    // Clickable overlay
    g.append("rect")
      .attr("width", innerW)
      .attr("height", innerH)
      .attr("fill", "transparent")
      .style("cursor", "crosshair")
      .on("click", function (event) {
        const [mx] = d3.pointer(event);
        const it = Math.round(xScale.invert(mx));
        const clamped = Math.max(0, Math.min(9, it));
        onIteration(clamped);
      });

    // Current iteration glowing dots (A and B)
    const cursors = activeIterations
      .map((it) => data.find((d) => d.iter === it))
      .filter(Boolean);

    cursors.forEach((cur, idx) => {
      const isA = idx === 0;
      const color = isA ? "#a4d673" : "#ffffff"; // Green for A, White for B
      const rgb = isA ? "164,214,115" : "255,255,255";

      // Vertical drop line
      g.append("line")
        .attr("x1", xScale(cur.iter))
        .attr("x2", xScale(cur.iter))
        .attr("y1", innerH)
        .attr("y2", yScale(cur.cost))
        .attr("stroke", color)
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "2,2")
        .attr("opacity", 0.6);

      // Pulse ring
      g.append("circle")
        .attr("cx", xScale(cur.iter))
        .attr("cy", yScale(cur.cost))
        .attr("r", 10)
        .attr("fill", `rgba(${rgb},0.2)`)
        .attr("stroke", "none");

      // Dot
      g.append("circle")
        .attr("cx", xScale(cur.iter))
        .attr("cy", yScale(cur.cost))
        .attr("r", 5)
        .attr("fill", color)
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.5)
        .attr("filter", `drop-shadow(0 0 5px rgba(${rgb},0.9))`);
    });
  }, [experiment, activeIterations]);

  if (!experiment) return null;

  return (
    <div className={`glass ${styles.wrapper}`}>
      <div className={styles.title}>Global Cost Convergence</div>
      <div className={styles.chartWrapper} ref={wrapperRef}>
        <svg ref={svgRef} className={styles.chart} />
      </div>
    </div>
  );
}
