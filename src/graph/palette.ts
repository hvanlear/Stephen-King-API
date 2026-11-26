// Colour and shape per kind, for the graph page. The server uses it for the
// counts and the first panel, the client for everything it draws. Kinds
// differ by shape as well as colour; a kind not listed here gets a spare
// colour and a rounded square, so a new kind renders with no change here.

export interface KindTheme {
  // Glyphs and lines
  color: string;
  // Small text on the dark panels (4.5:1 or better)
  text: string;
  // Text on a chip filled with `color`
  ink: string;
  shape: string;
}

export const PALETTE: Record<string, KindTheme> = {
  book: { color: "#efe6d6", text: "#efe6d6", ink: "#0d0c0c", shape: "square" },
  short: { color: "#f2b84b", text: "#f2b84b", ink: "#0d0c0c", shape: "pill" },
  villain: { color: "#e5484d", text: "#ef5f63", ink: "#0d0c0c", shape: "circle" },
  place: { color: "#7fa8ff", text: "#7fa8ff", ink: "#0d0c0c", shape: "diamond" },
  type: { color: "#7d55e0", text: "#9a7cf0", ink: "#ffffff", shape: "hexagon" },
  collection: { color: "#ff7ab8", text: "#ff7ab8", ink: "#0d0c0c", shape: "stack" },
  publication: { color: "#9be15d", text: "#9be15d", ink: "#0d0c0c", shape: "ring" },
  // Reserved for characters (SK-028, SK-029)
  character: { color: "#5fd0b4", text: "#5fd0b4", ink: "#0d0c0c", shape: "triangle" },
};

export const SPARE = ["#c9a0ff", "#4dd0e1", "#ffb38a", "#a3a9b3"];

// The theme for a kind, given the kinds in display order (so spares are stable)
export function kindTheme(kind: string, order: string[]): KindTheme {
  if (PALETTE[kind]) return PALETTE[kind];
  const unknown = order.filter((k) => !PALETTE[k]);
  const color = SPARE[Math.max(0, unknown.indexOf(kind)) % SPARE.length];
  return { color, text: color, ink: "#0d0c0c", shape: "generic" };
}
