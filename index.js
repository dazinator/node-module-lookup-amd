'use strict';

const ConfigFile = require('requirejs-config-file').ConfigFile;
const fs = require('fs');
const path = require('path');
const debug = require('debug')('lookup');
const find = require('find');
const fileExists = require('file-exists');
const requirejs = require('requirejs');

/**
 * Determines the real path of a potentially aliased dependency path
 * via the paths section of a require config
 *
 * @param  {Object} options - Pass a loaded config object if you'd like to avoid rereading the config
 * @param  {String} options.partial - The dependency name
 * @param  {String} options.filename - The file containing the dependency
 * @param  {String} [options.directory] - The directory to use for resolving absolute paths (when no config is used)
 * @param  {String|Object} [options.config] - Pass a loaded config object if you'd like to avoid rereading the config
 * @param  {String|Object} [options.configPath] - The location of the config file used to create the preparsed config object
 *
 * @return {String}
 */
module.exports = function(options) {
  let configPath = options.configPath;
  let config = options.config || {};
  let depPath = options.partial;
  let filename = options.filename;

  debug('config: ', config);
  debug('partial: ', depPath);
  debug('filename: ', filename);

  if (typeof config === 'string') {
    configPath = path.dirname(config);
    config = module.exports._readConfig(config);
    debug('converting given config file ' + configPath + ' to an object:\n', config);
  }

  if (configPath && !fs.statSync(configPath).isDirectory()) {
    configPath = path.dirname(configPath);
  }

  debug('configPath: ', configPath);

  if (!config.baseUrl) {
    config.baseUrl = './';
    debug('set baseUrl to ' + config.baseUrl);
  }

  let resolutionDirectory;

  if (configPath) {
    resolutionDirectory = configPath;
    debug('module resolution directory (based on configPath): ' + resolutionDirectory);

  } else if (options.directory && depPath[0] !== '.') {
    resolutionDirectory = options.directory;
    debug('module resolution directory (based on directory): ' + resolutionDirectory);

  } else {
    resolutionDirectory = path.dirname(options.filename);
    debug('module resolution directory (based on filename): ' + resolutionDirectory);
  }

  if (config.baseUrl[0] === '/') {
    debug('baseUrl with a leading slash detected');
    resolutionDirectory = resolutionDirectory.replace(config.baseUrl, '');
    debug('new resolution directory: ' + resolutionDirectory);
  }

  requirejs.config(config);

  depPath = stripLoader(depPath);

  let normalizedModuleId = requirejs.toUrl(depPath);
  debug('requirejs normalized module id: ' + normalizedModuleId);

  if (normalizedModuleId.indexOf('...') != -1) {
    debug('detected a nested subdirectory resolution that needs to be expanded');
    normalizedModuleId = normalizedModuleId.replace('.../', '../../');
    debug('expanded module id: ' + normalizedModuleId);
  }

  const resolved = path.join(resolutionDirectory, normalizedModuleId);

  debug('resolved url: ' + resolved);

  // No need to search for a file that already has an extension
  // Need to guard against jquery.min being treated as a real file
  if (path.extname(resolved) && fileExists.sync(resolved)) {
    debug(resolved + ' already has an extension and is a real file');
    return resolved;
  }

  const foundFile = findFileLike(normalizedModuleId, resolved) || '';

  if (foundFile) {
    debug('found file like ' + resolved + ': ' + foundFile);
  } else {
    debug('could not find any file like ' + resolved);
  }

  return foundFile;
};

function findFileLike(partial, resolved) {
  const fileDir = path.dirname(resolved);

  const pattern = escapeRegExp(resolved + '.');

  debug('looking for file like ' + pattern);
  debug('within ' + fileDir);

  try {
    const results = find.fileSync(new RegExp(pattern), fileDir);

    debug('found the following matches: ', results.join('\n'));

    // Not great if there are multiple matches, but the pattern should be
    // specific enough to prevent multiple results
    return results[0];

  } catch (e) {
    debug('error when looking for a match: ' + e.message);
    return '';
  }
}

function stripLoader(partial) {
  const exclamationLocation = partial.indexOf('!');

  if (exclamationLocation !== -1) {
    debug('stripping off the plugin loader from ' + partial);
    partial = partial.slice(exclamationLocation + 1);
    debug('partial is now ' + partial);
  }

  return partial;
}

function escapeRegExp(str) {
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
}

/**
 * Exposed for testing
 *
 * @private
 * @param  {String} configPath
 * @return {Object}
 */
module.exports._readConfig = function(configPath) {
  return new ConfigFile(configPath).read();
};
