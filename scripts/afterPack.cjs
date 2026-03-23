const fs = require('node:fs');
const path = require('node:path');

async function writeExeIcon(context) {
  if (process.platform !== 'win32') {
    return;
  }

  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  const iconPath = path.join(context.packager.projectDir, 'electron', 'assets', 'app-icon.ico');

  if (!fs.existsSync(exePath) || !fs.existsSync(iconPath)) {
    return;
  }

  const { rcedit } = await import('rcedit');

  await rcedit(exePath, {
    icon: iconPath,
  });
}

exports.default = async function afterPack(context) {
  await writeExeIcon(context);
};
