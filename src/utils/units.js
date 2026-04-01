const MM_PER_INCH = 25.4;
const PT_PER_INCH = 72;

function mmToPt(mm) {
  return (mm / MM_PER_INCH) * PT_PER_INCH;
}

function ptToMm(pt) {
  return (pt / PT_PER_INCH) * MM_PER_INCH;
}

/** A4 portrait in mm */
const PAPER_SIZES_MM = {
  A4: { width: 210, height: 297 },
  Letter: { width: 215.9, height: 279.4 }
};

function getPaperSizeMm(name) {
  const key = String(name || 'A4').toUpperCase();
  if (key === 'LETTER') return PAPER_SIZES_MM.Letter;
  return PAPER_SIZES_MM.A4;
}

module.exports = { mmToPt, ptToMm, getPaperSizeMm, PAPER_SIZES_MM };
