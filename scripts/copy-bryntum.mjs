// Copies Bryntum Calendar's prebuilt browser bundle, CSS and fonts into public/vendor/bryntum.
// The trial bundle is a single 5 MB obfuscated file that runs the bundler out of memory (>13 GB),
// so the calendar page loads it at runtime with a <script> tag instead of importing it.
// Runs automatically before `dev` and `build`; public/vendor is gitignored.
import { cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const src = path.join(process.cwd(), "node_modules", "@bryntum", "calendar");
const dest = path.join(process.cwd(), "public", "vendor", "bryntum");
const files = ["calendar.umd.js", "calendar.css", "stockholm-light.css"];
const dirs = ["fontawesome", "fonts"]; // CSS refers to these by relative path

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const f of files) cpSync(path.join(src, f), path.join(dest, f));
for (const d of dirs) cpSync(path.join(src, d), path.join(dest, d), { recursive: true });
console.log(`Copied Bryntum Calendar assets to ${path.relative(process.cwd(), dest)}`);
