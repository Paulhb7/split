import { getPortrait } from "./portraits";

// Expert avatar — the bundled "house majordome" cartoon portrait (see
// portraits.ts / assets/avatars). Rendered as a rounded thumbnail cropped to the
// face (object-position high, since the source art is full-body). Use this on
// showcase/roster surfaces; the etched `Crest` stays the small chrome glyph.
export function Avatar({
  slug,
  size = 40,
  className,
  radius = "50%",
}: {
  slug: string;
  size?: number;
  className?: string;
  /** override the rounding (e.g. a soft square for larger hero cards) */
  radius?: string;
}) {
  return (
    <img
      className={className}
      src={getPortrait(slug)}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      loading="lazy"
      draggable={false}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        objectFit: "cover",
        objectPosition: "50% 6%",
        background: "rgba(255,255,255,.05)",
        display: "block",
        flex: "0 0 auto",
      }}
    />
  );
}

export default Avatar;
