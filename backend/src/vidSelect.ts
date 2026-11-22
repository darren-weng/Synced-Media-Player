import fs from "fs";
import path from "path";
import { VIDEO_DIR } from "./paths";

const ALLOWED_VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".webm",
  ".ogg",
  ".mov",
  ".mkv",
  ".m4v",
]);

/**
 * Returns a list of video filenames located in the video directory.
 * Ignores hidden files (e.g. .DS_Store) and only returns files with valid video extensions.
 */
export async function getVideoList(dir: string = VIDEO_DIR): Promise<string[]> {
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    const files = await fs.promises.readdir(dir);
    return files.filter((file) => {
      if (file.startsWith(".")) return false;
      const ext = path.extname(file).toLowerCase();
      return ALLOWED_VIDEO_EXTENSIONS.has(ext);
    });
  } catch (err) {
    console.error("Error reading video directory:", err);
    throw err;
  }
}
