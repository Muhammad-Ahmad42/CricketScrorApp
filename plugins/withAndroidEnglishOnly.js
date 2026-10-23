const { withAppBuildGradle } = require('expo/config-plugins');

const LINE = '        resourceConfigurations += ["en"]';

module.exports = function withAndroidEnglishOnly(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.contents.includes(LINE.trim())) {
      return mod;
    }
    mod.modResults.contents = mod.modResults.contents.replace(/(defaultConfig \{\n)/, `$1${LINE}\n`);
    return mod;
  });
};
