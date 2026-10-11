import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const username = "MrFr0g-X";
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "User-Agent": "hothifa-profile-card",
};

async function github(url, options = {}) {
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) throw new Error(`GitHub request failed: ${response.status} ${url}`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join("; "));
  return payload;
}

const historyQuery = `query($owner:String!, $name:String!, $author:ID!, $cursor:String) {
  repository(owner:$owner, name:$name) {
    defaultBranchRef {
      target {
        ... on Commit {
          history(first:100, author:{id:$author}, after:$cursor) {
            totalCount
            pageInfo { hasNextPage endCursor }
            nodes { additions deletions }
          }
        }
      }
    }
  }
}`;

async function commitStatistics(repos, author) {
  const totals = { commits: 0, additions: 0, deletions: 0 };
  for (const repo of repos) {
    if (repo.fork || repo.name === username || repo.size === 0) continue;
    let cursor = null;
    let firstPage = true;
    do {
      const payload = await github("https://api.github.com/graphql", {
        method: "POST",
        body: JSON.stringify({ query: historyQuery, variables: { owner: username, name: repo.name, author, cursor } }),
      });
      const history = payload.data?.repository?.defaultBranchRef?.target?.history;
      if (!history) break;
      if (firstPage) totals.commits += history.totalCount;
      for (const commit of history.nodes) {
        totals.additions += commit.additions;
        totals.deletions += commit.deletions;
      }
      firstPage = false;
      cursor = history.pageInfo.hasNextPage ? history.pageInfo.endCursor : null;
    } while (cursor);
  }
  return totals;
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function text(x, y, value, className, extra = "") {
  return `<text x="${x}" y="${y}" class="${className}" ${extra}>${escapeXml(value)}</text>`;
}

function row(y, label, value) {
  const labelEnd = 438 + label.length * 8.1;
  const valueStart = 1020 - String(value).length * 8.1;
  const leader = valueStart - labelEnd > 25
    ? `<line x1="${Math.round(labelEnd + 12)}" y1="${y - 4}" x2="${Math.round(valueStart - 12)}" y2="${y - 4}" class="leader"/>`
    : "";
  return `${text(438, y, label, "key")}${leader}${text(1020, y, value, "value", 'text-anchor="end"')}`;
}

function section(y, label) {
  const end = 438 + label.length * 8.4;
  return `${text(438, y, label, "section")}<line x1="${Math.round(end + 14)}" y1="${y - 5}" x2="1020" y2="${y - 5}" class="rule"/>`;
}

async function portraitPng(color, strength) {
  const input = await readFile("assets/portrait-ascii.png");
  const width = 400;
  const height = 525;
  const grayscale = await sharp(input)
    .extract({ left: 520, top: 300, width: 1600, height: 2100 })
    .resize(width, height)
    .flatten({ background: "#ffffff" })
    .grayscale()
    .raw()
    .toBuffer();
  const pixels = Buffer.alloc(width * height * 4);
  for (let index = 0; index < grayscale.length; index++) {
    const alpha = Math.min(255, Math.round((255 - grayscale[index]) * strength));
    pixels[index * 4] = color[0];
    pixels[index * 4 + 1] = color[1];
    pixels[index * 4 + 2] = color[2];
    pixels[index * 4 + 3] = alpha < 7 ? 0 : alpha;
  }
  const png = await sharp(pixels, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return png.toString("base64");
}

function buildSvg(theme, portrait, stats) {
  const palette = theme === "dark"
    ? { text: "#c9d1d9", muted: "#8b949e", accent: "#79c0ff", key: "#f0b673", rule: "#485360" }
    : { text: "#24292f", muted: "#57606a", accent: "#0969da", key: "#9a6700", rule: "#a9b3bd" };
  const netLines = stats.additions - stats.deletions;
  const body = [
    text(438, 32, "hothifa@github", "heading"),
    row(62, "Role", "AI Engineer"),
    row(85, "Location", "Cairo, Egypt"),
    row(108, "Degree", "B.Sc. Computer Science, 2026"),
    row(131, "Work", "Intag | Tanmeyah"),
    section(170, "Focus and tools"),
    row(195, "Focus", "Speech, LLM evaluation, XAI"),
    row(218, "Languages", "Python, TypeScript, SQL"),
    row(241, "Toolchain", "PyTorch, FastAPI, Docker"),
    section(279, "Contact"),
    row(304, "Portfolio", "hothifa.is-a.dev"),
    row(327, "Email", "s-hothifa.mohamed@zewailcity.edu.eg"),
    row(350, "LinkedIn", "in/hothifa-hamdan"),
    section(389, "GitHub stats"),
    row(414, "Repositories", `${stats.repos} public`),
    row(437, "Commits", `${stats.commits.toLocaleString("en-US")} in public projects`),
    row(460, "Stars", `${stats.stars} earned`),
    row(483, "Followers", stats.followers.toLocaleString("en-US")),
    row(506, "Lines of code", `${netLines.toLocaleString("en-US")} (+${stats.additions.toLocaleString("en-US")} / -${stats.deletions.toLocaleString("en-US")})`),
    text(438, 528, "Net lines from authored public project commits.", "note"),
  ].join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1050" height="540" viewBox="0 0 1050 540" role="img" aria-labelledby="title desc">
<title id="title">Hothifa Hamdan - GitHub profile</title>
<desc id="desc">ASCII portrait and verified public GitHub statistics for Hothifa Hamdan.</desc>
<style>
.heading,.value,.key,.section,.note{font-family:Consolas,SFMono-Regular,Liberation Mono,monospace}
.heading{font-size:16px;font-weight:700;fill:${palette.accent}}
.key{font-size:14px;fill:${palette.key}}
.value{font-size:14px;fill:${palette.text}}
.section{font-size:13px;font-weight:700;fill:${palette.muted}}
.note{font-size:10px;fill:${palette.muted}}
.leader{stroke:${palette.rule};stroke-width:1;stroke-dasharray:1 4}
.rule{stroke:${palette.rule};stroke-width:1}
</style>
<image x="19" y="7" width="400" height="525" href="data:image/png;base64,${portrait}"/>
${body}
</svg>\n`;
}

const [user, repos, darkPortrait, lightPortrait] = await Promise.all([
  github(`https://api.github.com/users/${username}`),
  github(`https://api.github.com/users/${username}/repos?per_page=100&type=owner`),
  portraitPng([169, 189, 204], 2.2),
  portraitPng([43, 60, 72], 2.8),
]);
const commitStats = await commitStatistics(repos, user.node_id);
const stats = {
  repos: user.public_repos,
  stars: repos.filter((repo) => !repo.fork).reduce((total, repo) => total + repo.stargazers_count, 0),
  followers: user.followers,
  ...commitStats,
};
await Promise.all([
  writeFile("assets/profile-dark.svg", buildSvg("dark", darkPortrait, stats)),
  writeFile("assets/profile-light.svg", buildSvg("light", lightPortrait, stats)),
]);
console.log(JSON.stringify(stats));
