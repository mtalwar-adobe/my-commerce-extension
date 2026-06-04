const { Namer } = require('@parcel/plugin');

/**
 * Stable bundle names so CDN index.html always loads the latest deploy
 * (content-hashed filenames can leave index.html pointing at removed assets).
 */
module.exports = new Namer({
  name ({ bundle }) {
    if (bundle.type === 'js') {
      return 'web-src.js';
    }
    if (bundle.type === 'css') {
      return 'web-src.css';
    }
    return null;
  },
});
