const { withGradleProperties } = require('expo/config-plugins');

const OVERRIDES = {
  'expo.gif.enabled': 'false',
  'expo.webp.enabled': 'false',
  'expo.webp.animated': 'false',
};

module.exports = function withAndroidImageDecoders(config) {
  return withGradleProperties(config, (mod) => {
    for (const [key, value] of Object.entries(OVERRIDES)) {
      const existing = mod.modResults.find((item) => item.type === 'property' && item.key === key);
      if (existing) {
        existing.value = value;
      } else {
        mod.modResults.push({ type: 'property', key, value });
      }
    }
    return mod;
  });
};
