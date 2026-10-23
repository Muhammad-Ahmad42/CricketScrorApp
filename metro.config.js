const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const NON_IOS_STUBS = {
  'expo-symbols': path.resolve(__dirname, 'metro-stubs/expo-symbols.js'),
  '@expo/ui/jetpack-compose': path.resolve(__dirname, 'metro-stubs/expo-ui.js'),
  '@expo/ui/jetpack-compose/modifiers': path.resolve(__dirname, 'metro-stubs/expo-ui.js'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const stub = NON_IOS_STUBS[moduleName];
  if (stub && platform !== 'ios') {
    return { type: 'sourceFile', filePath: stub };
  }
  return context.resolveRequest(context, moduleName, platform);
};

if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    middleware(req, res, next);
  };
};

module.exports = config;
