module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-worklets/plugin powers Reanimated worklets. It must stay last.
    plugins: ['react-native-worklets/plugin'],
  };
};
