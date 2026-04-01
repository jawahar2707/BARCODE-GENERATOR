const TYPES = ['code128', 'ean13', 'upc', 'qrcode', 'code39'];

function normalizeType(t) {
  const s = String(t || 'code128').toLowerCase();
  if (s === 'upc-a' || s === 'upca') return 'upc';
  return s;
}

function isDigits(s) {
  return /^\d+$/.test(s);
}

function ean13CheckDigit(body12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = parseInt(body12[i], 10);
    sum += (i % 2 === 0 ? n : n * 3);
  }
  const mod = sum % 10;
  return mod === 0 ? 0 : 10 - mod;
}

function validateBarcodeValue(barcodeType, value) {
  const type = normalizeType(barcodeType);
  const v = String(value ?? '').trim();

  if (!TYPES.includes(type)) {
    return { ok: false, error: `Unsupported barcode type: ${barcodeType}` };
  }
  if (v.length === 0) {
    return { ok: false, error: 'Barcode value is empty' };
  }

  if (type === 'code128' || type === 'qrcode') {
    if (v.length > 2000) {
      return { ok: false, error: 'Value too long for barcode' };
    }
    return { ok: true, value: v, bcid: type === 'qrcode' ? 'qrcode' : 'code128' };
  }

  if (type === 'code39') {
    if (!/^[A-Z0-9\-. $/+%]+$/i.test(v)) {
      return { ok: false, error: 'Code39 allows A-Z, 0-9, space, and -.$/+%' };
    }
    return { ok: true, value: v.toUpperCase(), bcid: 'code39' };
  }

  if (type === 'ean13') {
    const digits = v.replace(/\s/g, '');
    if (!isDigits(digits)) {
      return { ok: false, error: 'EAN-13 must be numeric' };
    }
    if (digits.length === 12) {
      const check = ean13CheckDigit(digits);
      return { ok: true, value: digits + check, bcid: 'ean13' };
    }
    if (digits.length === 13) {
      const body = digits.slice(0, 12);
      const check = parseInt(digits[12], 10);
      if (ean13CheckDigit(body) !== check) {
        return { ok: false, error: 'EAN-13 check digit invalid' };
      }
      return { ok: true, value: digits, bcid: 'ean13' };
    }
    return { ok: false, error: 'EAN-13 needs 12 or 13 digits' };
  }

  if (type === 'upc') {
    const digits = v.replace(/\s/g, '');
    if (!isDigits(digits)) {
      return { ok: false, error: 'UPC must be numeric' };
    }
    if (digits.length === 11) {
      const check = upcACheckDigit(digits);
      return { ok: true, value: digits + check, bcid: 'upca' };
    }
    if (digits.length === 12) {
      const body = digits.slice(0, 11);
      const check = parseInt(digits[11], 10);
      if (upcACheckDigit(body) !== check) {
        return { ok: false, error: 'UPC-A check digit invalid' };
      }
      return { ok: true, value: digits, bcid: 'upca' };
    }
    return { ok: false, error: 'UPC-A needs 11 or 12 digits' };
  }

  return { ok: false, error: 'Unknown validation path' };
}

function upcACheckDigit(body11) {
  let odd = 0;
  let even = 0;
  for (let i = 0; i < 11; i++) {
    const n = parseInt(body11[i], 10);
    if (i % 2 === 0) odd += n;
    else even += n;
  }
  const total = odd * 3 + even;
  const mod = total % 10;
  return mod === 0 ? 0 : 10 - mod;
}

module.exports = {
  TYPES,
  normalizeType,
  validateBarcodeValue
};
