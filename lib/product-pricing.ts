/** Reference price rounded to a tidy amount, within 2% of the target. */
export function productDiscount(price: number, percent = 0) {
  if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(percent) || percent <= 0 || percent > 90) return null;
  const target = price / (1 - percent / 100);
  const step = target < 100 ? 5 : target < 1000 ? 10 : target < 10000 ? 50 : 100;
  let oldPrice = Math.ceil(target / step) * step;
  if (oldPrice <= price || Math.abs(oldPrice - target) / target > 0.02) {
    oldPrice = Math.ceil(target * 100) / 100;
  }
  if (!Number.isFinite(oldPrice) || oldPrice <= price) return null;
  return { oldPrice, percent: Math.round((1 - price / oldPrice) * 100) };
}
