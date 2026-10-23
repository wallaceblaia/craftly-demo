// Small input checks shared by the routes.

function positiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function text(value, max) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max ? value.trim() : null;
}

function email(value) {
  const v = text(value, 200);
  return v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v.toLowerCase() : null;
}

module.exports = { positiveInt, text, email };
