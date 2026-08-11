/**
 * What the product is called, as an attorney sees it. One constant so a rename
 * is one edit rather than a hunt through error messages.
 *
 * The places that CANNOT import this — package.json, electron-builder.yml, and
 * the <title> in src/index.html — carry the same string by hand. Change them
 * with this one.
 */
export const PRODUCT_NAME = 'Legion PDF';
