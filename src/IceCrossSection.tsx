import { useId } from "react";
export function IceCrossSection({
  bias,
  showShape,
  label,
  exaggeration,
}: {
  bias: number;
  showShape: boolean;
  label: string;
  exaggeration: number;
}) {
  const id = useId().replaceAll(":", "");
  const fall = showShape ? bias * exaggeration * 14 : 0;
  const left = 136 - fall,
    right = 136 + fall;
  return (
    <svg
      viewBox="0 0 700 380"
      role="img"
      aria-label={
        label + ", exaggerated ice cross-section viewed from the home end"
      }
    >
      <defs>
        <linearGradient id={id + "-face"} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f4fcff" />
          <stop offset="100%" stopColor="#a1c8da" />
        </linearGradient>
        <linearGradient id={id + "-top"} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#d0e8f3" />
        </linearGradient>
      </defs>
      <text x="350" y="27" textAnchor="middle">
        Cross-sheet cut · looking from home toward away
      </text>
      <ellipse
        cx="345"
        cy="326"
        rx="266"
        ry="15"
        fill="var(--navy)"
        opacity="0.07"
      />
      <path
        d={`M75 ${left} L530 ${right} L592 ${right - 34} L137 ${left - 34} Z`}
        fill={`url(#${id}-top)`}
        stroke="#8eafc0"
      />
      <path
        d={`M530 ${right} L592 ${right - 34} V270 L530 304 Z`}
        fill="#82b1c8"
        stroke="#779caf"
      />
      <path
        d={`M75 ${left} L530 ${right} V304 H75 Z`}
        fill={`url(#${id}-face)`}
        stroke="#8eafc0"
      />
      <path d="M76 266H529 M76 285H529" stroke="#87b1c5" opacity="0.45" />
      <path
        d={`M75 ${left} L530 ${right}`}
        fill="none"
        stroke={showShape ? "var(--primary)" : "var(--muted)"}
        className="ice-surface-profile"
        strokeWidth="5"
        strokeDasharray={showShape ? undefined : "8 7"}
      />
      <path
        d={`M137 ${left - 34} L592 ${right - 34}`}
        stroke="#a1c8da"
        fill="none"
      />
      <text x="75" y="353">
        Left side
      </text>
      <text x="530" y="353" textAnchor="end">
        Right side
      </text>
      {!showShape && (
        <text x="302" y="220" textAnchor="middle">
          Surface shape undetermined
        </text>
      )}
      {showShape && (
        <g>
          <path
            d={
              bias > 0
                ? `M555 ${right + 26}L535 ${right + 5}`
                : `M51 ${left + 26}L71 ${left + 5}`
            }
            stroke="var(--primary)"
            strokeWidth="2"
          />
          <text
            x={bias > 0 ? 558 : 49}
            y={(bias > 0 ? right : left) + 43}
            textAnchor={bias > 0 ? "start" : "end"}
          >
            Lower?
          </text>
        </g>
      )}
    </svg>
  );
}
