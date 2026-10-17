const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

// Expo configures workspace watch folders and isolated-install resolution itself.
const config = getDefaultConfig(__dirname);

// With isolated installs, workspace packages such as @my-farm/game-scene can get
// their own copy of a peer-dependent package. A second @react-three/fiber copy
// has its own React context, so its hooks throw "Hooks can only be used within
// the Canvas component" under the app's Canvas. Resolve these singletons from
// the app itself, whichever file imports them.
const singletonPackages = ["react", "react-native", "three", "@react-three/fiber"];
const appOrigin = path.join(__dirname, "package.json");

function isSingletonRequest(moduleName) {
  return singletonPackages.some((name) => moduleName === name || moduleName.startsWith(`${name}/`));
}

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  if (moduleName === "three") {
    // three's CommonJS entry is a deprecated shim that calls Node's
    // `process.emitWarning`, which React Native doesn't provide. CommonJS
    // dependencies such as @react-three/fiber's native build `require("three")`,
    // so always resolve three through its ES module entry instead.
    return resolve(
      {
        ...context,
        originModulePath: appOrigin,
        isESMImport: true,
        unstable_conditionNames: ["import", "react-native"],
      },
      moduleName,
      platform,
    );
  }
  if (isSingletonRequest(moduleName)) {
    return resolve({ ...context, originModulePath: appOrigin }, moduleName, platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
