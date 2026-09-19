"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

export const DEFAULT_LOGO_SRC = "https://magon.tech/assets/logos/logo.png";

export type MagonLogoProps = {
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
};

export function MagonLogo({
  size = 72,
  color = "#ffffff",
  className,
  style,
  title = "Magon",
}: MagonLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      className={className}
      style={style}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <g stroke={color} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M28 6.3 A26 26 0 0 0 28 57.7" />
        <path d="M36 6.3 A26 26 0 0 1 36 57.7" />
        <path d="M16.5 44 L16.5 26.5 L24.5 37 L32.5 26.5" />
        <path d="M46 27 A10 10 0 1 0 46 41 L46 34 L39.8 34" />
        <path d="M32 3.5 L32 60.5" strokeWidth={3.8} />
      </g>
    </svg>
  );
}

export type MagonBrandMarkProps = {
  logoSrc?: string;
  logo?: ReactNode;
  logoAlt?: string;
  size?: number;
  color?: string;
};

export function MagonBrandMark({
  logoSrc,
  logo,
  logoAlt,
  size = 72,
  color = "#ffffff",
}: MagonBrandMarkProps) {
  const [failed, setFailed] = useState(false);

  if (logo) return <>{logo}</>;
  if (failed) return <MagonLogo size={size} color={color} />;

  return (
    <img
      src={logoSrc ?? DEFAULT_LOGO_SRC}
      alt={logoAlt ?? "Magon"}
      onError={() => setFailed(true)}
      style={{ height: size, width: "auto", maxWidth: "100%", objectFit: "contain" }}
    />
  );
}
