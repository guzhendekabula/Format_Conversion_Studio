const path = require('node:path')
const { app } = require('electron')

function getFFmpegPath() {
  const binaryPath = require('ffmpeg-static')
  if (!app.isPackaged || !binaryPath) return binaryPath

  // ffmpeg-static resolves relative to its module under app.asar. The binary
  // is unpacked by electron-builder and must be launched from app.asar.unpacked.
  return binaryPath.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`,
  )
}

module.exports = { getFFmpegPath }
