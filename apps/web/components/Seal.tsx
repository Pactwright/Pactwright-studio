export function Seal({ size = 96, pressed = false, label = "Pactwright seal" }: { size?: number; pressed?: boolean; label?: string }) {
  return (
    <span
      className={`seal${pressed ? " seal--pressed" : ""}`}
      style={{ width: size, height: size }}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <picture style={{ display: "block", width: "100%", height: "100%" }}>
        <source type="image/webp" srcSet="/pactwright-mark-256.webp" />
        <img
          src="/pactwright-mark-256.png"
          alt={label || ""}
          width={size}
          height={size}
          fetchPriority="high"
          decoding="async"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: "50%" }}
        />
      </picture>
    </span>
  );
}
