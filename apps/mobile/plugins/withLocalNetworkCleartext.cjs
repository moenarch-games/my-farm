const { copyFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { withAndroidManifest, withDangerousMod, withInfoPlist } = require("expo/config-plugins");

// Keeps local/LAN plain-HTTP access across `expo prebuild` (#253). The app enforces which
// hosts may use http:// (src/serverUrlPolicy.ts); the platform configs only stop blocking it.
/** @type {import("expo/config-plugins").ConfigPlugin} */
function withLocalNetworkCleartext(config) {
  config = withDangerousMod(config, [
    "android",
    (modConfig) => {
      const xmlDir = join(modConfig.modRequest.platformProjectRoot, "app/src/main/res/xml");
      mkdirSync(xmlDir, { recursive: true });
      copyFileSync(
        join(__dirname, "network_security_config.xml"),
        join(xmlDir, "network_security_config.xml"),
      );
      return modConfig;
    },
  ]);

  config = withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (application) {
      application.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    }
    return modConfig;
  });

  return withInfoPlist(config, (modConfig) => {
    modConfig.modResults.NSAppTransportSecurity = {
      ...(modConfig.modResults.NSAppTransportSecurity ?? {}),
      NSAllowsLocalNetworking: true,
    };
    return modConfig;
  });
}

module.exports = withLocalNetworkCleartext;
