"use client";

import { useEffect, useRef } from "react";

import { landRows } from "./globe-land";

const radians = Math.PI / 180;
const points = landRows.flatMap((row, rowIndex) => {
  const latitude = (-88.2 + rowIndex * 1.8) * radians;
  const offset = (rowIndex % 2) * 0.5;
  return Array.from(row, (sample, index) => ({
    lon: ((index + offset) * 360 / row.length - 180) * radians,
    ring: Math.cos(latitude),
    height: Math.sin(latitude),
    land: sample === "1",
  }));
});

export default function CampusGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let startedAt: number | undefined;
    const tilt = 23 * radians;
    const sinTilt = Math.sin(tilt);
    const cosTilt = Math.cos(tilt);

    function draw(time: number) {
      if (!context || !canvas) return;
      startedAt ??= time;
      const turn = motion.matches ? 0 : Math.sin((time - startedAt) / 9000) * 0.55;
      const spin = 86 * radians + turn;
      const radius = 276;
      context.clearRect(0, 0, 640, 640);
      const fill = context.createRadialGradient(244, 190, 5, 320, 320, radius);
      fill.addColorStop(0, "#fff");
      fill.addColorStop(0.72, "#f5f3f1");
      fill.addColorStop(1, "#e6e2de");
      context.beginPath();
      context.arc(320, 320, radius, 0, Math.PI * 2);
      context.fillStyle = fill;
      context.fill();
      context.strokeStyle = "#817c7866";
      context.stroke();

      function project(lon: number, ring: number, height: number) {
        const x = Math.sin(lon + spin) * ring;
        const z = Math.cos(lon + spin) * ring;
        return {
          x: 320 + x * radius,
          y: 320 - (height * cosTilt - z * sinTilt) * radius,
          depth: z * cosTilt + height * sinTilt,
        };
      }

      for (const point of points) {
        const { x, y, depth } = project(point.lon, point.ring, point.height);
        if (depth <= 0) continue;
        context.fillStyle = point.land
          ? `rgba(85, 79, 75, ${0.18 + depth * 0.57})`
          : `rgba(114, 108, 103, ${0.035 + depth * 0.09})`;
        const size = point.land ? 1.05 + depth * 1.16 : 0.9;
        context.fillRect(x, y, size, size);
      }

      const latitude = 39.9812 * radians;
      const pin = project(-75.1557 * radians, Math.cos(latitude), Math.sin(latitude));
      if (pin.depth > 0.14) {
        context.beginPath();
        context.arc(pin.x, pin.y, 10, 0, Math.PI * 2);
        context.strokeStyle = "#a0193c77";
        context.stroke();
        context.beginPath();
        context.arc(pin.x, pin.y, 4, 0, Math.PI * 2);
        context.fillStyle = "#8b1734";
        context.fill();
        context.fillStyle = "#8b1734";
        context.font = "12px monospace";
        context.fillText("PHILADELPHIA", pin.x + 16, pin.y + 4);
      }

      if (!motion.matches) frame = requestAnimationFrame(draw);
    }

    function restart() {
      cancelAnimationFrame(frame);
      startedAt = undefined;
      draw(performance.now());
    }

    restart();
    motion.addEventListener("change", restart);
    return () => {
      cancelAnimationFrame(frame);
      motion.removeEventListener("change", restart);
    };
  }, []);

  return <canvas ref={canvasRef} width={640} height={640} aria-hidden="true" />;
}
