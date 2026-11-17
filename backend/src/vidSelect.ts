import fs from "fs";
import { VIDEO_DIR } from "./paths";

/**
 * Returns a list of video filenames located in the video directory.
 * Ignores hidden files (e.g. .DS_Store).
 */
export async function getVideoList(dir: string = VIDEO_DIR): Promise<string[]> {
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    const files = await fs.promises.readdir(dir);
    return files.filter((file) => !file.startsWith("."));
  } catch (err) {
    console.error("Error reading video directory:", err);
    throw err;
  }
}
