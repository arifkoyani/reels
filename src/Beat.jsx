// Renders one beat of a video from plain data, so a whole reel can be described
// in JSON instead of hand-written components.
//
//   { "step": 1, "icon": "link", "title": "Paste any {link}",
//     "sub": "...", "widget": "url", "url": "https://..." }
//
// Text wrapped in {curly braces} is drawn in the accent colour.
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS } from "./theme.js";
import { Icon } from "./Icon.jsx";

// Split "Links {break.}" into plain and accented runs
const accentParts = (text = "") =>
  text.split(/(\{[^}]*\})/g).filter(Boolean).map((chunk, i) =>
    chunk.startsWith("{") && chunk.endsWith("}") ? (
      <span key={i} style={{ color: COLORS.accent }}>
        {chunk.slice(1, -1)}
      </span>
    ) : (
      <span key={i}>{chunk}</span>
    ),
  );

const StepDots = ({ active }) => (
  <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
    {[1, 2, 3].map((n) => (
      <div
        key={n}
        style={{
          width: n === active ? 56 : 18,
          height: 18,
          borderRadius: 999,
          backgroundColor:
            n === active ? COLORS.accent : active > n ? "#FFC2A6" : COLORS.panelLine,
        }}
      />
    ))}
  </div>
);

const IconBubble = ({ name }) => (
  <div
    style={{
      width: 168,
      height: 168,
      borderRadius: 999,
      backgroundColor: COLORS.accentSoft,
      border: "3px solid #FFD9C6",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <Icon name={name} size={86} color={COLORS.accent} />
  </div>
);

// ---- widgets -------------------------------------------------------------
const UrlWidget = ({ url, frame }) => {
  const typed = interpolate(frame, [14, 46], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        marginTop: 26,
        width: "100%",
        padding: "22px 26px",
        borderRadius: 18,
        border: `3px solid ${COLORS.panelLine}`,
        backgroundColor: "#F7F9FC",
        fontFamily: FONTS.mono,
        fontSize: 30,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textAlign: "left",
      }}
    >
      {url.slice(0, Math.round(typed * url.length))}
      <span style={{ color: COLORS.accent }}>{typed < 1 ? "|" : ""}</span>
    </div>
  );
};

const ProgressWidget = ({ frame }) => {
  const fill = interpolate(frame, [10, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        marginTop: 30,
        width: 460,
        height: 14,
        borderRadius: 999,
        backgroundColor: COLORS.panelLine,
        overflow: "hidden",
      }}
    >
      <div style={{ width: `${fill * 100}%`, height: "100%", backgroundColor: COLORS.accent }} />
    </div>
  );
};

const TilesWidget = ({ tiles = [], frame, fps }) => (
  <div style={{ marginTop: 40, display: "flex", gap: 26, width: "100%" }}>
    {tiles.map((tile, i) => {
      const e = spring({
        frame: frame - (8 + i * 26),
        fps,
        config: { damping: 14, stiffness: 170 },
        durationInFrames: 16,
      });
      return (
        <div
          key={tile.label}
          style={{
            flex: 1,
            padding: "34px 20px",
            borderRadius: 28,
            border: `3px solid ${COLORS.panelLine}`,
            backgroundColor: "#FBFCFE",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            transform: `translateY(${interpolate(e, [0, 1], [34, 0])}px) scale(${interpolate(e, [0, 1], [0.9, 1])})`,
            opacity: e,
          }}
        >
          <Icon name={tile.icon} size={72} color={COLORS.accent} />
          <div style={{ fontSize: 38, fontWeight: 800 }}>{tile.label}</div>
        </div>
      );
    })}
  </div>
);

const BrandWidget = ({ brand, frame, fps }) => {
  const e = spring({ frame: frame - 18, fps, config: { damping: 18 }, durationInFrames: 22 });
  const [head, tail] = [brand.name.replace(brand.accent, ""), brand.accent];
  return (
    <div style={{ marginTop: 48, opacity: e, transform: `scale(${interpolate(e, [0, 1], [0.9, 1])})` }}>
      <div style={{ fontSize: 80, fontWeight: 800, letterSpacing: -2 }}>
        {head}
        <span style={{ color: COLORS.accent }}>{tail}</span>
      </div>
      {brand.url ? (
        <div style={{ marginTop: 8, fontSize: 42, fontWeight: 700, color: COLORS.accent }}>
          {brand.url}
        </div>
      ) : null}
    </div>
  );
};

// ---- the beat ------------------------------------------------------------
export const Beat = ({ beat, length }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [0, 7, length - 9, length], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // steps slide in from the right, like pages stepping through a window
  const slide = interpolate(frame, [0, 16], [70, 0], { extrapolateRight: "clamp" });

  const titleSize = beat.titleSize ?? (beat.icon ? 76 : 92);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        transform: `translateX(${slide}px)`,
        padding: "64px 60px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        fontFamily: FONTS.ui,
        color: COLORS.panelText,
      }}
    >
      {beat.step ? (
        <div style={{ position: "absolute", top: 52, left: 0, right: 0 }}>
          <StepDots active={beat.step} />
          <div
            style={{
              marginTop: 18,
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: 3,
              color: COLORS.accent,
            }}
          >
            STEP {beat.step}
          </div>
        </div>
      ) : null}

      {beat.icon ? <IconBubble name={beat.icon} /> : null}

      {beat.title ? (
        <div
          style={{
            marginTop: beat.icon ? 28 : 0,
            fontSize: titleSize,
            fontWeight: 800,
            letterSpacing: -1.5,
            lineHeight: 1.12,
          }}
        >
          {accentParts(beat.title)}
        </div>
      ) : null}

      {beat.sub ? (
        <div style={{ marginTop: 16, fontSize: 40, color: COLORS.panelMuted, fontWeight: 600 }}>
          {beat.sub}
        </div>
      ) : null}

      {beat.widget === "url" ? <UrlWidget url={beat.url} frame={frame} /> : null}
      {beat.widget === "progress" ? <ProgressWidget frame={frame} /> : null}
      {beat.widget === "tiles" ? <TilesWidget tiles={beat.tiles} frame={frame} fps={fps} /> : null}
      {beat.widget === "brand" ? <BrandWidget brand={beat.brand} frame={frame} fps={fps} /> : null}
    </div>
  );
};
