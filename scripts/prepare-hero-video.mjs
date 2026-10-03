// Turns the founder's animation in video/ into the web-ready home hero files in public/brand/.
//   node scripts/prepare-hero-video.mjs        (needs ffmpeg on the PATH)
// The source has its headline baked into the lower third. Like the still it replaces, the site
// uses the map portion only (the top 800 of 1248 rows) behind a real, accessible HTML headline.
import { execFileSync } from "node:child_process";

const SRC = "video/NBM_Connect_Animation.mp4";
const OUT = "public/brand";
const CROP = "crop=1920:800:0:0";

const ffmpeg = (...args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });
const encode = (width, crf, file) =>
  ffmpeg("-i", SRC, "-an", "-vf", `${CROP},scale=${width}:-2`, "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-preset", "slow", "-crf", String(crf), "-movflags", "+faststart", `${OUT}/${file}`);

encode(1600, 27, "nbm-hero.mp4");
encode(900, 29, "nbm-hero-900.mp4");

// The final frame: shown before the video loads, and instead of it when motion is reduced.
ffmpeg("-sseof", "-0.1", "-i", SRC, "-frames:v", "1", "-update", "1", "-vf", `${CROP},scale=1600:-2`, "-q:v", "4", `${OUT}/nbm-hero-poster.jpg`);
ffmpeg("-sseof", "-0.1", "-i", SRC, "-frames:v", "1", "-update", "1", "-vf", `${CROP},scale=900:-2`, "-q:v", "5", `${OUT}/nbm-hero-poster-900.jpg`);

console.log("Hero video and posters written to public/brand");
