"use client";

import { useEffect } from "react";

export function ScrollReveal() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    document.documentElement.classList.add("js-ready");

    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll(".scroll-reveal").forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.05,
        rootMargin: "100px 0px 100px 0px",
      }
    );

    // Every section that can reveal is in the HTML by the time this runs, so one scan is enough.
    document.querySelectorAll(".scroll-reveal:not(.is-visible)").forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return null;
}
