"use client";

import { useEffect, useRef } from "react";
import type { AnimationItem } from "lottie-web";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * A decorative-but-labelled Lottie mark.
 *
 * - `lottie-web` is imported lazily on first use, so it never enters the initial bundle.
 * - Plays once when 35% of the box is visible (or immediately with `playOnMount`).
 * - With `prefers-reduced-motion: reduce` the final frame is shown without playing.
 * - A failed fetch or malformed JSON leaves the reserved box empty instead of throwing.
 */
export function LottieMark({
  src,
  size,
  label,
  className,
  playOnMount = false,
  ratio = 1,
}: {
  src: "/lottie/seal-press.json" | "/lottie/receipt-stitch.json";
  size: number;
  label: string;
  className?: string;
  playOnMount?: boolean;
  /** height / width of the composition, so a wide mark is not letterboxed inside a square box. */
  ratio?: number;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // StrictMode mounts, tears down and remounts this effect. Clear anything a
    // previous pass rendered so we never stack two <svg> trees in one node.
    host.replaceChildren();

    let disposed = false;
    let animation: AnimationItem | null = null;
    let observer: IntersectionObserver | null = null;
    let loadStarted = false;
    let playWanted = false;

    const reducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(REDUCED_MOTION).matches;

    const clear = () => {
      observer?.disconnect();
      observer = null;
      if (animation) {
        try {
          animation.destroy();
        } catch {
          // A partially-initialised player may not clean up; the node reset below is enough.
        }
        animation = null;
      }
      host.replaceChildren();
    };

    const load = () => {
      if (loadStarted || disposed) return;
      loadStarted = true;

      void (async () => {
        try {
          // Dynamic import keeps lottie-web out of the first-load JS bundle.
          const mod = await import("lottie-web");
          if (disposed) return;
          const lottie = (mod as any).default ?? mod;

          const instance: AnimationItem = lottie.loadAnimation({
            container: host,
            renderer: "svg",
            loop: false,
            autoplay: false,
            path: src,
          });
          if (disposed) {
            instance.destroy();
            return;
          }
          animation = instance;

          const onLoaded = () => {
            if (disposed) return;
            // The generated <svg> is decorative; the wrapper carries the label.
            host.querySelector("svg")?.setAttribute("aria-hidden", "true");
            if (reducedMotion) {
              instance.goToAndStop(Math.max(instance.totalFrames - 1, 0), true);
            } else if (playWanted) {
              instance.play();
            }
          };

          const onFailed = () => {
            if (disposed) return;
            // Missing or malformed JSON: drop the player, keep the reserved box.
            clear();
          };

          instance.addEventListener("DOMLoaded", onLoaded);
          instance.addEventListener("data_failed", onFailed);
          instance.addEventListener("error", onFailed);
        } catch {
          if (!disposed) clear();
        }
      })();
    };

    if (reducedMotion) {
      // Static final frame: no need to wait for the viewport.
      load();
    } else if (playOnMount) {
      playWanted = true;
      load();
    } else if (typeof IntersectionObserver === "undefined") {
      playWanted = true;
      load();
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
              // One-shot: never restart when the mark scrolls back into view.
              observer?.unobserve(entry.target);
              observer?.disconnect();
              observer = null;
              playWanted = true;
              if (animation) animation.play();
              else load();
              break;
            }
          }
        },
        { threshold: [0.35] },
      );
      observer.observe(host);
    }

    return () => {
      disposed = true;
      clear();
    };
  }, [src, playOnMount]);

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={label}
      className={className}
      data-lottie={src}
      style={{ width: size, maxWidth: "100%", aspectRatio: String(1 / ratio), display: "block", overflow: "hidden" }}
    />
  );
}
