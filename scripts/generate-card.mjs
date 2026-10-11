import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

const username = "MrFr0g-X";
const portraitUrl = "https://hothifa.is-a.dev/profile.jpg";
const headers = { Accept: "application/vnd.github+json", "User-Agent": "hothifa-profile-card" };
if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;

async function getJson(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`GitHub request failed: ${response.status} ${url}`);
  return response.json();
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function svgText(x, y, content, className = "value", extra = "") {
  return `<text x="${x}" y="${y}" class="${className}" ${extra}>${escapeXml(content)}</text>`;
}

function row(y, label, value) {
  return `${svgText(462, y, label, "key")}${svgText(686, y, value)}`;
}

async function portraitAscii() {
  const response = await fetch(portraitUrl);
  if (!response.ok) throw new Error(`Portrait request failed: ${response.status}`);
  const input = Buffer.from(await response.arrayBuffer());
  const width = 42;
  const height = 39;
  const pixels = await sharp(input)
    .extract({ left: 161, top: 164, width: 190, height: 234 })
    .resize(width, height, { fit: "fill" })
    .grayscale()
    .normalize()
    .raw()
    .toBuffer();
  const shades = "  .:-=+*#%@";
  const lines = [];
  for (let y = 0; y < height; y++) {
    let line = "";
    for (let x = 0; x < width; x++) {
      const dx = (x - width / 2) / (width / 2);
      const dy = (y - height / 2) / (height / 2);
      if (dx * dx + dy * dy > 0.98) {
        line += " ";
        continue;
      }
      const luminosity = pixels[y * width + x];
      const level = Math.min(shades.length - 1, Math.max(0, Math.floor((luminosity / 255) * shades.length)));
      line += shades[level];
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

function buildSvg(theme, ascii, stats) {
  const palettes = {
    dark: { surface: "#0d1117", panel: "#101720", edge: "#303d4b", text: "#e6edf3", muted: "#9daebf", accent: "#79c0ff", key: "#e3a86b", portrait: "#b4d7ee" },
    light: { surface: "#f6f8fa", panel: "#ffffff", edge: "#d0d7de", text: "#24292f", muted: "#57606a", accent: "#0969da", key: "#9a6700", portrait: "#40769a" },
  };
  const p = palettes[theme];
  const art = ascii.map((line, index) => svgText(34, 69 + index * 13.4, line, "ascii", 'xml:space="preserve"')).join("\n");
  const bio = [
    row(109, "Role", "AI Engineer"),
    row(137, "Location", "Cairo, Egypt"),
    row(165, "Education", "B.Sc. Computer Science · 2026"),
    row(193, "Focus", "Speech · LLM evaluation · XAI"),
  ].join("\n");
  const work = [
    row(267, "CallTone", "Speech + LLM quality assurance"),
    row(295, "FLUQAS", "Bilingual medical QA · research"),
    row(323, "MRI research", "Classification + explanation"),
    row(351, "ZewailCalendar", "Schedule → calendar"),
  ].join("\n");
  const stack = [
    row(423, "Languages", "Python · TypeScript · SQL"),
    row(451, "AI / data", "PyTorch · scikit-learn · SHAP"),
    row(479, "Delivery", "FastAPI · Docker · PostgreSQL"),
  ].join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="590" viewBox="0 0 1080 590" role="img" aria-labelledby="title desc">
<title id="title">Hothifa Hamdan · AI Engineer</title>
<desc id="desc">Terminal-style profile with an ASCII portrait, selected work, technical stack, and GitHub statistics.</desc>
<style>
.value,.key,.section,.stat,.ascii,.heading,.subheading{font-family:ui-monospace,SFMono-Regular,Consolas,Liberation Mono,monospace}
.heading{font-size:21px;font-weight:700;fill:${p.accent}}
.subheading{font-size:13px;fill:${p.muted}}
.key{font-size:14px;fill:${p.key}}
.value{font-size:14px;fill:${p.text}}
.section{font-size:13px;font-weight:700;letter-spacing:1.3px;fill:${p.muted}}
.stat{font-size:13px;fill:${p.text}}
.ascii{font-size:13px;letter-spacing:0;fill:${p.portrait}}
</style>
<rect width="1080" height="590" rx="16" fill="${p.surface}"/>
<rect x="1" y="1" width="1078" height="588" rx="15" fill="none" stroke="${p.edge}"/>
<rect x="18" y="18" width="1044" height="554" rx="12" fill="${p.panel}" stroke="${p.edge}"/>
<circle cx="42" cy="39" r="6" fill="#ff5f57"/><circle cx="61" cy="39" r="6" fill="#febc2e"/><circle cx="80" cy="39" r="6" fill="#28c840"/>
${svgText(487, 44, "hothifa@github: ~", "subheading")}
${art}
<line x1="436" y1="65" x2="436" y2="550" stroke="${p.edge}"/>
${svgText(462, 77, "Hothifa Hamdan", "heading")}
${bio}
${svgText(462, 234, "SELECTED WORK", "section")}
<line x1="592" y1="229" x2="1034" y2="229" stroke="${p.edge}"/>
${work}
${svgText(462, 390, "TOOLCHAIN", "section")}
<line x1="554" y1="385" x2="1034" y2="385" stroke="${p.edge}"/>
${stack}
${svgText(462, 514, "GITHUB", "section")}
<line x1="528" y1="509" x2="1034" y2="509" stroke="${p.edge}"/>
${svgText(462, 545, `${stats.repos} public repos`, "stat")}
${svgText(690, 545, `${stats.stars} stars`, "stat")}
${svgText(866, 545, `${stats.followers} followers`, "stat")}
</svg>\n`;
}

const [user, repos, ascii] = await Promise.all([
  getJson(`https://api.github.com/users/${username}`),
  getJson(`https://api.github.com/users/${username}/repos?per_page=100&type=owner`),
  portraitAscii(),
]);
const stats = {
  repos: user.public_repos,
  stars: repos.filter((repo) => !repo.fork).reduce((total, repo) => total + repo.stargazers_count, 0),
  followers: user.followers,
};
await mkdir("assets", { recursive: true });
await Promise.all([
  writeFile("assets/profile-dark.svg", buildSvg("dark", ascii, stats)),
  writeFile("assets/profile-light.svg", buildSvg("light", ascii, stats)),
]);
console.log(`Generated profile cards: ${stats.repos} repos, ${stats.stars} stars, ${stats.followers} followers`);
