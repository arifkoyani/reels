// Single source of truth for look and feel. Change a value here and every
// composition that imports it follows.

export const COLORS = {
  bg: "#131C2D",
  panelBg: "#FFFFFF",
  panelText: "#131C2D",
  panelMuted: "#5A6678",
  panelLine: "#E3E7EE",
  accent: "#FF550D",
  accentSoft: "#FFF1EA",
  textLight: "#FFFFFF",
  textDim: "rgba(255,255,255,0.40)",
  // second subtitle line
  subtitleAccent: "#B04528",
  // the bot's own screen glow, matching the eyes painted into the sprite
  screenGlow: "#FAD06C",
  screen: "rgb(22, 26, 36)",
};

export const FONTS = {
  ui: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
  mono: "monospace",
};

// Vertical zones for the bot layout, measured from the reference frame.
export const LAYOUT = {
  width: 1080,
  height: 1920,
  fps: 30,
  panelLeft: 75,
  panelWidth: 930,
  panelTop: 130,
  panelHeight: 910,
  botWidth: 310,
  botLeft: 88,
  botTop: 838,
  titleTop: 1270,
};

// Subtitle lines alternate: small bold white sans, then large serif accent.
export const SUBTITLE_LINES = [
  {
    fontFamily: FONTS.ui,
    fontSize: 62,
    fontWeight: 800,
    letterSpacing: "-1.5px",
    color: COLORS.textLight,
  },
  {
    fontFamily: FONTS.serif,
    fontSize: 112,
    fontWeight: 900,
    letterSpacing: "-2px",
    color: COLORS.subtitleAccent,
  },
];
