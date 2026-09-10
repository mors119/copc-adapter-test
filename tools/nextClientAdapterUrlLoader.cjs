module.exports = function nextClientAdapterUrlLoader(source) {
  return source.replaceAll('import.meta.url', 'window.location.href');
};
