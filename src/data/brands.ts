// Brand keyword → list of legitimate registrable domains for that brand.
// A URL host containing a keyword whose registrable domain is NOT in the list
// is flagged BRAND_LOOKALIKE (see src/core/urls.ts).
// ASSUMPTION: one canonical registrable domain per lesser-known brand where
// several official domains exist; extend freely, this is plain data.
export const BRANDS: Record<string, string[]> = {
  paypal: ['paypal.com'],
  amazon: ['amazon.com', 'amazon.in', 'amazon.co.uk', 'amzn.to', 'amazon.de'],
  apple: ['apple.com', 'icloud.com'],
  google: ['google.com', 'goo.gl'],
  microsoft: ['microsoft.com', 'live.com', 'office.com'],
  netflix: ['netflix.com'],
  facebook: ['facebook.com', 'meta.com'],
  instagram: ['instagram.com'],
  whatsapp: ['whatsapp.com', 'wa.me'],
  dhl: ['dhl.com', 'dhl.de'],
  fedex: ['fedex.com'],
  ups: ['ups.com'],
  usps: ['usps.com'],
  royalmail: ['royalmail.com'],
  irs: ['irs.gov'],
  hmrc: ['hmrc.gov.uk'],
  paytm: ['paytm.com'],
  phonepe: ['phonepe.com'],
  hdfc: ['hdfcbank.com'],
  icici: ['icicibank.com'],
  sbi: ['sbi.co.in', 'onlinesbi.sbi'],
  axis: ['axisbank.com'],
  flipkart: ['flipkart.com'],
  gpay: ['google.com'],
  chase: ['chase.com'],
  wellsfargo: ['wellsfargo.com'],
  bankofamerica: ['bankofamerica.com'],
  coinbase: ['coinbase.com'],
  binance: ['binance.com'],
};
