export function Seal({ size = 96, pressed = false, label = "Pactwright seal" }: { size?: number; pressed?: boolean; label?: string }) {
  return (
    <span
      className={`seal${pressed ? " seal--pressed" : ""}`}
      style={{ width: size, height: size }}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <img
        src="/pactwright-mark.png"
        alt={label || ""}
        width={size}
        height={size}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: "50%" }}
      />
    </span>
  );
}
