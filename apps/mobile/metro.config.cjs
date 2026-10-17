const { getDefaultConfig } = require("expo/metro-config");

// Expo configures workspace watch folders and isolated-install resolution itself.
const config = getDefaultConfig(__dirname);

// three's CommonJS entry is a deprecated shim that calls Node's
// `process.emitWarning`, which React Native doesn't provide. CommonJS
// dependencies such as @react-three/fiber's native build `require("three")`,
// so always resolve three through its ES module entry instead.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  if (moduleName === "three") {
    return resolve(
      { ...context, isESMImport: true, unstable_conditionNames: ["import", "react-native"] },
      moduleName,
      platform,
    );
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
