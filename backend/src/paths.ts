import fs from "fs";
import path from "path";

/**
 * Traverses upwards to find the directory containing package.json (the project root).
 */
export function getProjectRoot(startDir: string = __dirname): string {
  let currentDir = path.resolve(startDir);
  while (currentDir !== path.parse(currentDir).root) {
    if (fs.existsSync(path.join(currentDir, "package.json"))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  return path.resolve(startDir, "../..");
}

const projectRoot = getProjectRoot();

export const HTML_DIR = process.env.HTML_DIR
  ? path.resolve(process.env.HTML_DIR)
  : path.join(projectRoot, "frontend/src");

export const VIDEO_DIR = process.env.VIDEO_DIR
  ? path.resolve(process.env.VIDEO_DIR)
  : path.join(projectRoot, "backend/src/videos");
