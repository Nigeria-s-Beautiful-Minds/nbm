"use client";

import { useEffect, useRef, useState } from "react";

const Poster = () => (
  <picture>
    <source media="(max-width: 760px)" srcSet="/brand/nbm-hero-poster-900.jpg" />
    <img className="hero-image" src="/brand/nbm-hero-poster.jpg" alt="" width={1600} height={666} />
  </picture>
);

/**
 * The home hero animation (video/NBM_Connect_Animation.mp4, prepared by scripts/prepare-hero-video.mjs).
 * Decorative and silent. It opens from black, plays once and rests on its final frame. Visitors
 * who ask for reduced motion, or whose browser won't autoplay, get that final frame as a still.
 */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setStill(true);
    video.src = window.matchMedia("(max-width: 760px)").matches ? "/brand/nbm-hero-900.mp4" : "/brand/nbm-hero.mp4";
    video.play().catch(() => setStill(true));
  }, []);

  return (
    <>
      {still ? <Poster /> : <video ref={ref} className="hero-image" muted playsInline preload="none" aria-hidden="true" tabIndex={-1} disablePictureInPicture onError={() => setStill(true)} />}
      <noscript><Poster /></noscript>
    </>
  );
}
