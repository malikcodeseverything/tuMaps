// Stylised preview of what the app does: one start, one destination, three
// routes that trade distance for risk around incident hot zones.

const STREETS_X = [60, 120, 180, 240, 300, 360, 420];
const STREETS_Y = [90, 150, 210, 270, 330];

const ROUTES = [
  // Fastest cuts straight through both hot zones.
  { id: "fastest", d: "M60 330 H180 V210 H300 V90 H420", color: "#3b82f6", delay: "0.2s" },
  // Balanced skirts the big zone but passes the smaller one.
  { id: "balanced", d: "M60 330 H300 V210 H360 V90 H420", color: "#a855f7", delay: "0.45s" },
  // Safest takes the long way around both.
  { id: "safest", d: "M60 330 H420 V90", color: "#22c55e", delay: "0.7s" },
];

export default function RouteIllustration() {
  return (
    <svg
      viewBox="0 0 480 400"
      className="w-full h-auto"
      role="img"
      aria-label="Three routes between two points: the fastest crosses incident hot zones, the safest goes around them"
    >
      <defs>
        <radialGradient id="heat" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.55" />
          <stop offset="45%" stopColor="#f97316" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Street grid */}
      <g stroke="rgba(255,255,255,0.07)" strokeWidth="10" strokeLinecap="round">
        {STREETS_X.map((x) => (
          <line key={`x${x}`} x1={x} y1={60} x2={x} y2={360} />
        ))}
        {STREETS_Y.map((y) => (
          <line key={`y${y}`} x1={30} y1={y} x2={450} y2={y} />
        ))}
      </g>

      {/* Incident hot zones */}
      <circle cx="205" cy="225" r="95" fill="url(#heat)" />
      <circle cx="310" cy="125" r="60" fill="url(#heat)" />

      {/* Routes */}
      <g fill="none" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
        {ROUTES.map((r) => (
          <path
            key={r.id}
            d={r.d}
            stroke={r.color}
            pathLength={1}
            className="route-draw"
            style={{ ["--route-length" as string]: 1, animationDelay: r.delay }}
          />
        ))}
      </g>

      {/* Start */}
      <circle cx="60" cy="330" r="10" fill="#22c55e" className="pulse-ring" />
      <circle cx="60" cy="330" r="9" fill="#22c55e" stroke="#07090d" strokeWidth="3" />
      {/* Destination */}
      <circle cx="420" cy="90" r="9" fill="#ef4444" stroke="#07090d" strokeWidth="3" />

      <g fontFamily="JetBrains Mono, monospace" fontSize="11" fill="rgba(255,255,255,0.45)">
        <text x="74" y="356">START</text>
        <text x="370" y="72">DESTINATION</text>
      </g>
    </svg>
  );
}
