import { useEffect, useRef } from "react";
import * as d3 from "d3";
import styles from "./GlobalCostChart.module.css";

export default function GlobalResponseChart({ experiment, activeIterations }) {
  const chartRef = useRef();

  useEffect(() => {
    const globalResponses = experiment?.globalResponses;
    if (!globalResponses || globalResponses.length === 0) return;
    if (!chartRef.current) return;

    const container = d3.select(chartRef.current);
    container.selectAll("*").remove();

    // Setup dimensions
    const margin = { top: 20, right: 20, bottom: 40, left: 50 };
    const width =
      container.node().getBoundingClientRect().width -
      margin.left -
      margin.right;
    // Fallback to 130 height if bounding box isn't available quickly enough
    const currentHeight =
      container.node().getBoundingClientRect().height || 130;
    const height = currentHeight - margin.top - margin.bottom;

    // Handle initial zero height
    if (height <= 0) return;

    const svg = container
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Flatten all values across all iterations to get global yExtent
    const allValues = globalResponses.flatMap((d) => d.values || []);
    if (!allValues.length) return;

    const xExtent = [0, globalResponses[0].values.length - 1];
    const yExtent = d3.extent(allValues);

    const xPad = 0;
    const yPad = (yExtent[1] - yExtent[0]) * 0.1 || 0.1;

    const xScale = d3.scaleLinear().domain(xExtent).range([0, width]);

    const yScale = d3
      .scaleLinear()
      .domain([yExtent[0] - yPad, yExtent[1] + yPad])
      .range([height, 0]);

    // Draw axes
    svg
      .append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(xScale).ticks(10))
      .attr("color", "var(--text-muted)")
      .selectAll("text")
      .style("font-family", "inherit");

    svg
      .append("g")
      .call(d3.axisLeft(yScale).ticks(5))
      .attr("color", "var(--text-muted)")
      .selectAll("text")
      .style("font-family", "inherit");

    // Style grid lines
    svg
      .selectAll(".tick line")
      .attr("stroke", "var(--border-glass)")
      .attr("stroke-dasharray", "2,2");
    svg.selectAll(".domain").remove();

    // Line generator mapping dimension index to x, and value to y
    const line = d3
      .line()
      .x((d, i) => xScale(i))
      .y((d) => yScale(d));

    const markerColors = ["var(--accent)", "var(--accent-light)"];

    // Filter global responses to only use key changes
    const keyResponses = globalResponses.filter((d) =>
      experiment.keyIterations.includes(d.iter),
    );

    // Calculate the most recent key iteration for each active iteration
    const effectiveActiveIterations = activeIterations.map((iter) => {
      const pastOrCurrentKeys = experiment.keyIterations.filter(
        (k) => k <= iter,
      );
      return pastOrCurrentKeys.length > 0
        ? pastOrCurrentKeys[pastOrCurrentKeys.length - 1]
        : 0;
    });

    // Filter responses by active and inactive to ensure active ones are drawn on top
    const inactiveResponses = keyResponses.filter(
      (d) => !effectiveActiveIterations.includes(d.iter),
    );
    const activeResponses = keyResponses.filter((d) =>
      effectiveActiveIterations.includes(d.iter),
    );

    // Create tooltip
    const tooltip = container
      .append("div")
      .style("position", "absolute")
      .style("visibility", "hidden")
      .style("background", "var(--bg-elevated)")
      .style("border", "1px solid var(--border-glass)")
      .style("padding", "8px 12px")
      .style("border-radius", "8px")
      .style("color", "var(--text)")
      .style("font-size", "0.85rem")
      .style("pointer-events", "none")
      .style("box-shadow", "0 4px 12px rgba(0,0,0,0.5)")
      .style("z-index", "10");

    // Draw inactive responses (translucent background)
    inactiveResponses.forEach((d) => {
      if (d && d.values) {
        svg
          .append("path")
          .datum(d.values)
          .attr("fill", "none")
          .attr("stroke", "var(--text-muted)")
          .attr("stroke-width", 1.5)
          .attr("stroke-opacity", 0.15)
          .attr("d", line);
      }
    });

    // Draw active iterations prominently on top
    activeResponses.forEach((d) => {
      const activeIdx = effectiveActiveIterations.indexOf(d.iter);
      const color =
        markerColors[activeIdx % markerColors.length] || "var(--accent)";

      if (d && d.values) {
        // Draw the vector as a line graph
        svg
          .append("path")
          .datum(d.values)
          .attr("fill", "none")
          .attr("stroke", color)
          .attr("stroke-width", 2.5)
          .attr("stroke-opacity", 0.9)
          .attr("d", line);

        // Draw points for each dimension
        svg
          .append("g")
          .selectAll("circle")
          .data(d.values.map((val, idx) => ({ val, idx })))
          .enter()
          .append("circle")
          .attr("cx", (item) => xScale(item.idx))
          .attr("cy", (item) => yScale(item.val))
          .attr("r", 3.5)
          .attr("fill", color)
          .attr("stroke", "var(--bg-panel)")
          .attr("stroke-width", 1.5)
          .style("cursor", "pointer")
          .on("mouseover", function (event, item) {
            d3.select(this).attr("r", 6).attr("stroke", "white");

            tooltip.style("visibility", "visible").html(`
                <div style="font-weight: 600; margin-bottom: 4px; color: ${color}">Vector Value</div>
                <div>Index: <strong>${item.idx}</strong></div>
                <div>Value: <strong>${item.val.toFixed(4)}</strong></div>
              `);
          })
          .on("mousemove", function (event) {
            const [x, y] = d3.pointer(event, document.body);
            tooltip.style("left", `${x + 15}px`).style("top", `${y - 10}px`);
          })
          .on("click", function (event, item) {
            // Also trigger on click nicely for mobile/preferences
            d3.select(this).attr("r", 6).attr("stroke", "white");
          })
          .on("mouseout", function () {
            d3.select(this).attr("r", 3.5).attr("stroke", "var(--bg-panel)");
            tooltip.style("visibility", "hidden");
          });
      }
    });
  }, [experiment, activeIterations]);

  return (
    <div
      className={styles.chartContainer}
      style={{
        height: "100%",
        flex: 1,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div className={styles.chartHeader}>Global Response Vector</div>
      <div
        className={styles.chartSvgWrapper}
        ref={chartRef}
        style={{ flex: 1 }}
      />
    </div>
  );
}
