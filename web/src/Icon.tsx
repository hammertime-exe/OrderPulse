import type { CSSProperties } from "react";

const paths = {
  overview: ["M3 3h7v7H3z", "M14 3h7v7h-7z", "M3 14h7v7H3z", "M14 14h7v7h-7z"],
  orders: [
    "M9 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3",
    "M9 3h6v4H9z",
    "M8 12h8",
    "M8 16h6",
  ],
  inventory: [
    "m12 3 9 5-9 5-9-5 9-5Z",
    "M3 8v9l9 5 9-5V8",
    "M12 13v9",
    "m7.5 5.5 9 5",
  ],
  calendar: [
    "M5 5h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
    "M16 3v4",
    "M8 3v4",
    "M3 11h18",
    "M8 15h2",
    "M14 15h2",
    "M8 18h2",
  ],
  activity: ["M3 12h4l3-8 4 16 3-8h4"],
  approval: [
    "M9 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3",
    "M9 3h6v4H9z",
    "m8 14 3 3 5-6",
  ],
  compass: [
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z",
    "m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z",
  ],
  sparkles: [
    "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
    "M20 2v4",
    "M18 4h4",
  ],
  history: ["M3 11a9 9 0 1 1 2.6 7.4", "M3 4v7h7", "M12 7v5l3 2"],
  settings: [
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
    "m9 3-.7 2.3-2 1.1L4 6l-2 3.5 1.6 1.8v2.4L2 15.5 4 19l2.3-.4 2 1.1L9 22h6l.7-2.3 2-1.1 2.3.4 2-3.5-1.6-1.8v-2.4L22 9.5 20 6l-2.3.4-2-1.1L15 3H9Z",
  ],
  search: ["M21 21l-5-5"],
  arrow: ["M7 17 17 7", "M7 7h10v10"],
  chevronDown: ["m6 9 6 6 6-6"],
  chevronLeft: ["m15 18-6-6 6-6"],
  chevronRight: ["m9 18 6-6-6-6"],
  check: ["m5 12 4 4L19 6"],
  shield: ["M12 3 3 7v5c0 5 5 8 9 10 4-2 9-5 9-10V7l-9-4Z", "m8 12 3 3 5-6"],
  close: ["m6 6 12 12", "M18 6 6 18"],
  plus: ["M12 5v14", "M5 12h14"],
  alert: ["m12 3 10 18H2L12 3Z", "M12 9v4", "M12 17h.01"],
  empty: ["m3 7 9-4 9 4v13H3V7Z", "M3 12h5l2 3h4l2-3h5"],
  mail: [
    "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
    "m3 6 9 7 9-7",
  ],
  refresh: [
    "M20 7a8 8 0 0 0-14-2L3 8",
    "M3 3v5h5",
    "M4 17a8 8 0 0 0 14 2l3-3",
    "M16 16h5v5",
  ],
} as const;
export type IconName = keyof typeof paths;

export default function Icon({
  name,
  size = 20,
  className = "",
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      data-icon={name}
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      {paths[name].map((d, i) => (
        <path key={i} d={d} />
      ))}
      {name === "search" && <circle cx="10.5" cy="10.5" r="6.5" />}
    </svg>
  );
}
