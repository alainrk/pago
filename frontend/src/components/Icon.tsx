import type { CSSProperties } from "react";
import { ICONS, ICON_VIEWBOX, type IconName } from "./icons";

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

// The SVG markup in ICONS is a trusted, build-time constant that lives in our
// own repo (src/components/icons.ts). It never comes from user input or a
// network call, so using dangerouslySetInnerHTML here is safe.
export function Icon({ name, size = 16, className, style, title }: IconProps) {
  return (
    <span
      className={className}
      style={{ display: "inline-flex", flexShrink: 0, width: size, height: size, ...style }}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
    >
      <svg
        viewBox={ICON_VIEWBOX[name] ?? "0 0 16 16"}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height="100%"
        style={{ display: "block" }}
        dangerouslySetInnerHTML={{ __html: ICONS[name] }}
      />
    </span>
  );
}
