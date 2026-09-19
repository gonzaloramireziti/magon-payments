import { existsSync, readFileSync, writeFileSync } from "node:fs";

const files = ["dist/index.js", "dist/index.cjs"];
const directive = '"use client";\n';

for (const file of files) {
  if (!existsSync(file)) continue;
  const content = readFileSync(file, "utf8");
  if (content.startsWith('"use client"') || content.startsWith("'use client'")) continue;
  writeFileSync(file, directive + content);
}
