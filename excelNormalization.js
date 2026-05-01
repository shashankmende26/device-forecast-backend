// Excel normalization layer for device-forecast backend
// Reads Excel, extracts BOMs for multiple devices, and produces normalized BOMs and inventory
// No forecast logic here; only normalization and validation

const xlsx = require('xlsx');

// Predefined valid device codes
const VALID_DEVICES = [
  'PM125', 'PM250SK', 'STSK', 'PG', 'WGFK', 'LPMV2_FV', 'PM250MAX', 'LPM CHINA'
];

/**
 * Reads an Excel file and normalizes BOMs and inventory for multiple devices.
 * Only includes predefined valid devices.
 * @param {string} filePath - Path to the Excel file
 * @returns {{ deviceBOMs: Object<string, Array>, inventory: Array, ignoredDeviceColumns: Array }}
 *   deviceBOMs: { [deviceName]: BomItem[] }
 *   inventory: InventoryItem[]
 *   ignoredDeviceColumns: string[]
 * @throws Error on validation failure
 */
function normalizeExcelToBOMsAndInventory(filePath) {
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });
  if (!rows.length) throw new Error('Excel sheet is empty');
  // Robust column normalization
  const normalizeCol = (col) => String(col).replace(/\s|_/g, '').toLowerCase();
  const header = Object.keys(rows[0]);
  const colMap = {};
  for (const col of header) {
    const norm = normalizeCol(col);
    // Accept common variations for each required field
    if (["materialcode", "code", "materialid", "itemcode", "itemid", "partid"].includes(norm)) colMap.partId = col;
    if (["materialname", "name", "material", "itemname", "partname"].includes(norm)) colMap.partName = col;
    if (["maincategory", "maincat", "category", "cat", "main_category"].includes(norm)) colMap.mainCategory = col;
    if (["subcategory", "subcat", "sub_category", "sub-category"].includes(norm)) colMap.subCategory = col;
    if (["stock", "availablestock", "qtyinstock", "quantityinstock", "qty", "quantity", "available"].includes(norm)) colMap.availableStock = col;
    if (["uom", "unitofmeasure", "unit", "measure"].includes(norm)) colMap.uom = col;
    if (["buypriceinrs", "buyprice(rs)", "unitprice", "priceinrs", "price", "buyprice"].includes(norm)) colMap.unitPrice = col;
    if (["stockvalue", "inventoryvalue", "value"].includes(norm)) colMap.stockValue = col;
    if (["currency"].includes(norm)) colMap.currency = col;
    if (["conversionrate", "rate"].includes(norm)) colMap.conversionRate = col;
    if (["bomsum", "bomsumtotal", "bomsum(total)", "bomsum_"].includes(norm)) colMap.bomSum = col; // informational only
  }

  // Only treat columns matching VALID_DEVICES as device columns (exact match)
  const mappedCols = new Set(Object.values(colMap));
  const deviceCols = header.filter(col => VALID_DEVICES.includes(col.trim()));
  const ignoredDeviceColumns = header.filter(col => !mappedCols.has(col) && !deviceCols.includes(col));
  if (!colMap.partId || !colMap.partName || !colMap.mainCategory || !colMap.subCategory || !colMap.availableStock)
    throw new Error('Missing one or more required columns: material code, material name, main category, sub category, stock');
  if (deviceCols.length === 0) throw new Error('No valid device columns found in Excel. Expected one of: ' + VALID_DEVICES.join(", "));

  // Build inventory and per-device BOMs
  const inventory = [];
  const deviceBOMs = {};
  for (const device of deviceCols) deviceBOMs[device] = [];
  for (const row of rows) {
    // Validate material fields
    const partId = row[colMap.partId];
    const partName = row[colMap.partName];
    const mainCategory = row[colMap.mainCategory];
    const subCategory = row[colMap.subCategory];
    const availableStock = parseNumber(row[colMap.availableStock]);
    if (!partId || !partName || !mainCategory || !subCategory) throw new Error('Missing required material fields');
    if (availableStock == null || isNaN(availableStock)) throw new Error(`Invalid or missing stock for partId ${partId}`);
    if (availableStock < 0) throw new Error(`Negative stock for partId ${partId}`);
    // Inventory item
    const invItem = {
      partId: String(partId),
      partName: String(partName),
      mainCategory: String(mainCategory),
      subCategory: String(subCategory),
      availableStock: availableStock,
      uom: colMap.uom ? row[colMap.uom] : null,
      unitPrice: colMap.unitPrice ? parseNumber(row[colMap.unitPrice]) : null,
      stockValue: colMap.stockValue ? parseNumber(row[colMap.stockValue]) : null,
      currency: colMap.currency ? row[colMap.currency] : null,
      conversionRate: colMap.conversionRate ? parseNumber(row[colMap.conversionRate]) : null,
      // BOM SUM is informational only, not used in logic
      bomSum: colMap.bomSum ? parseNumber(row[colMap.bomSum]) : null
    };
    inventory.push(invItem);

    // Per-device BOMs: only validate device columns, ignore all others
    for (const device of deviceCols) {
      const qty = row[device];
      if (qty == null || qty === "" || (typeof qty === "string" && qty.trim() === "")) continue;
      const requiredQty = parseNumber(qty);
      if (requiredQty == null || isNaN(requiredQty)) throw new Error(`Non-numeric quantity for device ${device}, partId ${partId}`);
      if (requiredQty < 0) throw new Error(`Negative quantity for device ${device}, partId ${partId}`);
      if (requiredQty === 0) continue;
      const bomItem = {
        partId: String(partId),
        partName: String(partName),
        mainCategory: String(mainCategory),
        subCategory: String(subCategory),
        requiredQuantityPerDevice: requiredQty
      };
      deviceBOMs[device].push(bomItem);
    }
  }

  // Final validations
  for (const device in deviceBOMs) {
    const seen = new Set();
    for (const bom of deviceBOMs[device]) {
      if (seen.has(bom.partId)) throw new Error(`Duplicate partId ${bom.partId} in BOM for device ${device}`);
      seen.add(bom.partId);
      if (typeof bom.requiredQuantityPerDevice !== 'number' || bom.requiredQuantityPerDevice <= 0) throw new Error(`Invalid requiredQuantityPerDevice for partId ${bom.partId}`);
    }
  }
  const invSeen = new Set();
  for (const inv of inventory) {
    if (invSeen.has(inv.partId)) throw new Error(`Duplicate partId ${inv.partId} in inventory`);
    invSeen.add(inv.partId);
    if (typeof inv.availableStock !== 'number' || inv.availableStock < 0) throw new Error(`Invalid availableStock for partId ${inv.partId}`);
  }

  return { deviceBOMs, inventory, ignoredDeviceColumns };
}

function normalizeQuantityType(qt) {
  if (!qt) throw new Error('Missing quantityType');
  const val = String(qt).trim().toLowerCase();
  if (["discrete", "pcs", "unit", "piece", "pieces"].includes(val)) return "discrete";
  if (["fractional", "kg", "meter", "meters", "g", "gram", "litre", "liter", "ml"].includes(val)) return "fractional";
  throw new Error(`Unknown quantityType: ${qt}`);
}

function parseNumber(val) {
  if (val == null || val === "") return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

module.exports = { normalizeExcelToBOMsAndInventory };