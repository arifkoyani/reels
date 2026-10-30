// Renders any Lucide icon straight from lucide-static's icon-nodes.json, so no
// SVG webpack loader is needed. ~2000 icons available by name.
import iconNodes from "lucide-static/icon-nodes.json";

export const hasIcon = (name) => Boolean(iconNodes[name]);

export const Icon = ({ name, size = 84, color = "currentColor", strokeWidth = 1.9 }) => {
  const nodes = iconNodes[name];
  if (!nodes) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {nodes.map(([tag, attrs], i) => {
        const Tag = tag;
        return <Tag key={i} {...attrs} />;
      })}
    </svg>
  );
};
