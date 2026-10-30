// Isometric supporting graphic, built with the Anatomy skill's craft rules:
// filled solids (never wireframes), four tones by facing, strict painter's order
// (back to front, bottom to top), exactly one "lit" accent — the PDF sheet — and
// every line ending on a face, an edge or a terminal dot.
import { interpolate } from "remotion";

// Tone hierarchy: base/feet lo, structure mid, subject hi, one accent lit.
const LO = "#7A4A22";
const MID = "#A1643048";
const TONE = {
  trayTop: "#B4763C",
  traySideL: "#8E5628",
  traySideR: "#6F421E",
  stackTop: "#E8DCC8",
  stackSideL: "#C9BBA3",
  stackSideR: "#A89880",
  sheetTop: "#FFFFFF",
  sheetSideL: "#E4E4E4",
  sheetSideR: "#C8C8C8",
  accent: "#FAD06C",
  ink: "#6F421E",
};

// World units -> screen. x and y lie on the floor, z is up.
const iso = (x, y, z) => {
  const c = Math.cos(Math.PI / 6);
  const s = Math.sin(Math.PI / 6);
  return [(x - y) * c, (x + y) * s - z];
};

const pts = (list) => list.map(([x, y, z]) => iso(x, y, z).join(",")).join(" ");

// A rectangular solid: top face plus the two visible sides, shaded by facing.
const Slab = ({ x, y, z, w, d, h, top, left, right }) => (
  <g>
    {/* left side (painted first: it sits behind the right side) */}
    <polygon
      points={pts([
        [x, y + d, z],
        [x, y + d, z + h],
        [x + w, y + d, z + h],
        [x + w, y + d, z],
      ])}
      fill={left}
    />
    {/* right side */}
    <polygon
      points={pts([
        [x + w, y, z],
        [x + w, y, z + h],
        [x + w, y + d, z + h],
        [x + w, y + d, z],
      ])}
      fill={right}
    />
    {/* top face */}
    <polygon
      points={pts([
        [x, y, z + h],
        [x + w, y, z + h],
        [x + w, y + d, z + h],
        [x, y + d, z + h],
      ])}
      fill={top}
    />
  </g>
);

// Screws as small dots at the tray corners — detail that belongs to a part.
const Screw = ({ x, y, z }) => {
  const [sx, sy] = iso(x, y, z);
  return (
    <g>
      <circle cx={sx} cy={sy} r={1.5} fill={TONE.traySideR} />
      <circle cx={sx} cy={sy - 0.4} r={0.7} fill={TONE.trayTop} />
    </g>
  );
};

// Rule lines standing in for printed text; they run edge to edge on the face.
const RuleLines = ({ x, y, z, w, rows }) =>
  rows.map((rw, i) => {
    const ly = y + 7 + i * 5;
    const [ax, ay] = iso(x + 5, ly, z);
    const [bx, by] = iso(x + 5 + w * rw, ly, z);
    return (
      <line
        key={i}
        x1={ax}
        y1={ay}
        x2={bx}
        y2={by}
        stroke={TONE.ink}
        strokeOpacity={0.32}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    );
  });

/**
 * lift: 0 = sheet resting in the tray, 1 = sheet fully raised and labelled PDF.
 */
export const IsoDocTray = ({ lift = 0, size = 300 }) => {
  const rise = interpolate(lift, [0, 1], [0, 26]);
  const labelIn = interpolate(lift, [0.55, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <svg
      viewBox="-120 -110 240 190"
      width={size}
      height={size * 0.79}
      style={{ overflow: "visible" }}
    >
      {/* contact shadow on the floor, so the tray sits on something */}
      <ellipse cx={0} cy={38} rx={74} ry={26} fill="#000" opacity={0.34} />

      {/* --- painted back to front, bottom to top --- */}

      {/* 1. base plate (lo) */}
      <Slab
        x={-46}
        y={-46}
        z={0}
        w={92}
        d={92}
        h={5}
        top={TONE.trayTop}
        left={TONE.traySideL}
        right={TONE.traySideR}
      />

      {/* 2. corner screws, on the base plate's top face */}
      <Screw x={-40} y={-40} z={5} />
      <Screw x={38} y={-40} z={5} />
      <Screw x={-40} y={38} z={5} />
      <Screw x={38} y={38} z={5} />

      {/* 3. the resting stack (mid) */}
      <Slab
        x={-34}
        y={-34}
        z={5}
        w={68}
        d={68}
        h={7}
        top={TONE.stackTop}
        left={TONE.stackSideL}
        right={TONE.stackSideR}
      />
      <g opacity={0.9}>
        <RuleLines x={-34} y={-34} z={12} w={56} rows={[0.82, 0.64, 0.74]} />
      </g>

      {/* 4. the lifted sheet — the one lit part */}
      <g transform={`translate(0, ${-rise})`}>
        <Slab
          x={-30}
          y={-30}
          z={12}
          w={60}
          d={60}
          h={3}
          top={TONE.sheetTop}
          left={TONE.sheetSideL}
          right={TONE.sheetSideR}
        />
        <RuleLines x={-30} y={-30} z={15} w={50} rows={[0.9, 0.7, 0.8, 0.45]} />

        {/* PDF label plate, riding on the sheet's top face */}
        <g opacity={labelIn}>
          {(() => {
            const [lx, ly] = iso(-22, -24, 15);
            return (
              <g transform={`translate(${lx}, ${ly})`}>
                <rect
                  x={-2}
                  y={-9}
                  width={34}
                  height={15}
                  rx={3}
                  fill={TONE.accent}
                  transform="skewY(30)"
                />
                <text
                  x={15}
                  y={2}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={900}
                  fill={TONE.ink}
                  fontFamily="Segoe UI, Arial, sans-serif"
                  transform="skewY(30)"
                >
                  PDF
                </text>
              </g>
            );
          })()}
        </g>
      </g>

      {/* 5. rails either side of the tray (structure, mid tone) — drawn last
             because they sit in front of the stack on screen */}
      <Slab
        x={-52}
        y={-46}
        z={0}
        w={6}
        d={92}
        h={12}
        top={TONE.trayTop}
        left={TONE.traySideL}
        right={TONE.traySideR}
      />
      <Slab
        x={46}
        y={-46}
        z={0}
        w={6}
        d={92}
        h={12}
        top={TONE.trayTop}
        left={TONE.traySideL}
        right={TONE.traySideR}
      />
    </svg>
  );
};
