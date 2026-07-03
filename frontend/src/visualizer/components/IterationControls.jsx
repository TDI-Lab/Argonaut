/**
 * IterationControls.jsx
 * Slider + play/pause controls for stepping through EPOS iterations.
 * Supports two modes:
 *   - 'all'  : slider steps through all iterations (0–39)
 *   - 'key'  : slider snaps to key iterations only (where plans changed)
 */
import { useEffect, useRef, useState } from "react";
import styles from "./IterationControls.module.css";

const SPEEDS = [500]; // ms per frame
const SPEED_LABELS = ["1×"];

/**
 * @param {Object}   props.experiment    – current experiment object
 * @param {number}   props.iteration     – 0-based index
 * @param {Function} props.onIteration   – callback(newIteration)
 * @param {string}   props.iterMode      – 'all' | 'key'
 */
export default function IterationControls({
  experiment,
  iteration,
  onIteration,
  iterMode,
}) {
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0); // default 1×
  const timerRef = useRef(null);

  const keyIters = experiment?.keyIterations ?? [];
  const totalIters = experiment?.config?.numIterations ?? 40;

  // Determine which iteration indices are available given the mode
  const available =
    iterMode === "key"
      ? keyIters
      : Array.from({ length: totalIters }, (_, i) => i);
  const currentIdx =
    available.indexOf(iteration) === -1 ? 0 : available.indexOf(iteration);

  // Auto-advance when playing
  useEffect(() => {
    if (!playing) {
      clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      onIteration((prev) => {
        const idx = available.indexOf(prev);
        const next =
          idx < available.length - 1 ? available[idx + 1] : available[0];
        return next;
      });
    }, SPEEDS[speedIdx]);
    return () => clearInterval(timerRef.current);
  }, [playing, speedIdx, available, onIteration]);

  // When experiment changes, reset to first iteration
  useEffect(() => {
    setPlaying(false);
    onIteration(available[0] ?? 0);
  }, [experiment?.id, iterMode]);

  function stepBy(delta) {
    const nextIdx = Math.max(
      0,
      Math.min(available.length - 1, currentIdx + delta),
    );
    onIteration(available[nextIdx]);
  }

  function handleSlider(e) {
    onIteration(available[Number(e.target.value)] ?? 0);
  }

  return (
    <div className={`glass ${styles.controls}`}>
      {/* Play / Pause */}
      <button
        className={`btn ${playing ? "btn-primary" : "btn-ghost"} ${styles.playBtn}`}
        onClick={() => setPlaying((p) => !p)}
        id="btn-play-pause"
        title={playing ? "Pause" : "Play"}
      >
        {playing ? "⏸" : "▶"}
      </button>

      {/* Step backward */}
      <button
        className={`btn btn-ghost ${styles.stepBtn}`}
        onClick={() => stepBy(-1)}
        disabled={currentIdx === 0}
        id="btn-step-back"
        title="Previous iteration"
      >
        ‹
      </button>

      {/* Slider */}
      <div className={styles.sliderWrap}>
        <div className={styles.sliderTrack}>
          {/* Key iteration markers */}
          {iterMode === "all" &&
            keyIters.map((k) => (
              <span
                key={k}
                className={styles.keyDot}
                style={{ left: `${(k / (totalIters - 1)) * 100}%` }}
                title={`Key change at iteration ${k}`}
              />
            ))}
          <input
            type="range"
            className={styles.slider}
            min={0}
            max={available.length - 1}
            value={currentIdx}
            onChange={handleSlider}
            id="iteration-slider"
          />
        </div>
        <div className={styles.iterLabel}>
          <span className={styles.iterNum}>Iteration {iteration}</span>
          {iterMode === "key" && (
            <span className={styles.keyBadge}>
              {available.length} key changes
            </span>
          )}
        </div>
      </div>

      {/* Step forward */}
      <button
        className={`btn btn-ghost ${styles.stepBtn}`}
        onClick={() => stepBy(1)}
        disabled={currentIdx === available.length - 1}
        id="btn-step-fwd"
        title="Next iteration"
      >
        ›
      </button>
    </div>
  );
}
