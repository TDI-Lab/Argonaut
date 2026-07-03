/**
 * MetricConvergenceChart.jsx
 * Reusable D3 line+area chart for displaying any convergence metric over iterations.
 * Accepts pre-computed data, title, axis labels, and color as props.
 * Replaces the single-purpose GlobalCostChart with a configurable abstraction.
 */
import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import styles from "./GlobalCostChart.module.css";

/**
 * @param {Array}    props.data              – [{ iter, value }, …]
 * @param {string}   props.title             – chart title
 * @param {string}   props.yLabel            – Y-axis label
 * @param {string}   props.color             – accent color (hex)
 * @param {number[]} props.activeIterations  – highlighted iteration indices
 * @param {Function} props.onIteration       – callback on click
 * @param {number[]} props.keyIterations     – key change iteration indices
 */
export default function MetricConvergenceChart({
  data = [],
  title = "Convergence",
  showTitle = true,
  yLabel = "Value",
  color = "#a4d673",
  activeIterations = [],
  onIteration,
  keyIterations = [],
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
    const W = dims.w > 0 ? dims.w : wrapperRef.current?.clientWidth || 600;
    const H = dims.h > 0 ? dims.h : wrapperRef.current?.clientHeight || 130;

    if (!data.length || !svgRef.current || W === 0 || H === 0) return;

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
    const maxIter = d3.max(data, (d) => d.iter) || 1;
    const xScale = d3.scaleLinear().domain([0, maxIter]).range([0, innerW]);

    const [minVal, maxVal] = d3.extent(data, (d) => d.value);
    const pad = (maxVal - minVal) * 0.05 || 0.01;
    const yScale = d3
      .scaleLinear()
      .domain([minVal - pad, maxVal + pad])
      .range([innerH, 0]);

    // Gradient fill
    const gradId = `metric-grad-${title.replace(/[^a-z0-9]/gi, "")}`;
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
      .attr("stop-color", color)
      .attr("stop-opacity", 0.4);
    grad
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", color)
      .attr("stop-opacity", 0);

    // Area fill
    const area = d3
      .area()
      .x((d) => xScale(d.iter))
      .y0(innerH)
      .y1((d) => yScale(d.value))
      .curve(d3.curveMonotoneX);
    g.append("path")
      .datum(data)
      .attr("d", area)
      .attr("fill", `url(#${gradId})`);

    // Line
    const line = d3
      .line()
      .x((d) => xScale(d.iter))
      .y((d) => yScale(d.value))
      .curve(d3.curveMonotoneX);
    g.append("path")
      .datum(data)
      .attr("d", line)
      .attr("fill", "none")
      .attr("stroke", color)
      .attr("stroke-width", 2);

    // X axis
    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(Math.min(data.length, 10))
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
      .call(d3.axisLeft(yScale).ticks(4).tickFormat(d3.format(".3f")))
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
      .text(yLabel);

    // Key iteration markers
    keyIterations.forEach((k) => {
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
        const clamped = Math.max(0, Math.min(maxIter, it));
        if (onIteration) onIteration(clamped);
      });

    // Active iteration glowing dots
    const rgb = hexToRgb(color);
    const cursors = activeIterations
      .map((it) => data.find((d) => d.iter === it))
      .filter(Boolean);

    cursors.forEach((cur, idx) => {
      const isA = idx === 0;
      const dotColor = isA ? color : "#ffffff";
      const dotRgb = isA ? rgb : "255,255,255";

      // Vertical drop line
      g.append("line")
        .attr("x1", xScale(cur.iter))
        .attr("x2", xScale(cur.iter))
        .attr("y1", innerH)
        .attr("y2", yScale(cur.value))
        .attr("stroke", dotColor)
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "2,2")
        .attr("opacity", 0.6);

      // Pulse ring
      g.append("circle")
        .attr("cx", xScale(cur.iter))
        .attr("cy", yScale(cur.value))
        .attr("r", 10)
        .attr("fill", `rgba(${dotRgb},0.2)`)
        .attr("stroke", "none");

      // Dot
      g.append("circle")
        .attr("cx", xScale(cur.iter))
        .attr("cy", yScale(cur.value))
        .attr("r", 5)
        .attr("fill", dotColor)
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.5)
        .attr("filter", `drop-shadow(0 0 5px rgba(${dotRgb},0.9))`);
    });
  }, [data, title, yLabel, color, activeIterations, keyIterations, dims]);

  if (!data.length) return null;

  return (
    <div className={`glass ${styles.wrapper}`}>
      {showTitle && <div className={styles.title}>{title}</div>}
      <div className={styles.chartWrapper} ref={wrapperRef}>
        <svg ref={svgRef} className={styles.chart} />
      </div>
    </div>
  );
}

/** Convert hex color to "r,g,b" string for rgba() usage */
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
