const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const PERMISSION = '<uses-permission android:name="android.permission.INTERNET" tools:node="replace"/>';

module.exports = function withDebugInternet(config) {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const file = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'debug', 'AndroidManifest.xml');
      if (!fs.existsSync(file)) {
        return mod;
      }
      const contents = fs.readFileSync(file, 'utf8');
      if (!contents.includes('android.permission.INTERNET')) {
        fs.writeFileSync(file, contents.replace(/(<manifest[^>]*>\s*)/, `$1${PERMISSION}\n    `));
      }
      return mod;
    },
  ]);
};
