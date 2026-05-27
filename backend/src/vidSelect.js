const path = require("path");
const fs = require("fs");

const videoDir = path.join(__dirname, "videos");

async function getVideoList() {
  let files = await fs.promises.readdir(videoDir);
  return files;
}

module.exports = { getVideoList };
