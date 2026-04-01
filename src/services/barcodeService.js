const bwipjs = require('bwip-js');
const { validateBarcodeValue } = require('../utils/barcodeValidation');

/**
 * Renders barcode as PNG buffer. Uses bwip-js (local, no network).
 */
function renderPngBuffer(barcodeType, rawValue, options = {}) {
  const validated = validateBarcodeValue(barcodeType, rawValue);
  if (!validated.ok) {
    const err = new Error(validated.error);
    err.code = 'BARCODE_INVALID';
    throw err;
  }

  const { bcid, value } = validated;
  const scale = Math.max(1, Math.min(6, options.scale || 3));

  const opts = {
    bcid,
    text: value,
    scale,
    includetext: false,
    backgroundcolor: 'FFFFFF',
    paddingwidth: 4,
    paddingheight: 4
  };

  if (bcid === 'qrcode') {
    opts.scale = Math.max(2, scale);
  }

  return new Promise((resolve, reject) => {
    bwipjs.toBuffer(opts, (err, png) => {
      if (err) reject(err);
      else resolve(png);
    });
  });
}

module.exports = { renderPngBuffer, validateBarcodeValue };
