module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    // babel-preset-expo adds the react-native-worklets plugin Reanimated needs.
    presets: ["babel-preset-expo"],
  };
};
