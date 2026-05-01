// Excel normalization layer for device-forecast backend
// Reads Excel, extracts BOMs for multiple devices, and produces normalized BOMs and inventory
// No forecast logic here; only normalization and validation

const xlsx = require('xlsx');

/**
 * Reads an Excel file and normalizes BOMs and inventory for multiple devices.
 * @param {string} filePath - Path to the Excel file
 * @returns {{ deviceBOMs: Object<string, Array>, inventory: Array }}
 *   deviceBOMs: { [deviceName]: BomItem[] }
 *   inventory: InventoryItem[]
 * @throws Error on validation failure
 */
function normalizeExcelToBOMsAndInventory(filePath) {
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });
  if (!rows.length) throw new Error('Excel sheet is empty');
  console.log(`Excel rows: ${JSON.stringify(rows)}`);
  // Robust column normalization
  const normalizeCol = (col) => String(col).replace(/\s|_/g, '').toLowerCase();
  const header = Object.keys(rows[0]);
  console.log(`Excel header: ${header}`);
  const colMap = {};
  for (const col of header) {
    const norm = normalizeCol(col);
    // Accept common variations for each required field
    if (["materialcode", "code", "materialid", "itemcode", "itemid", "partid"].includes(norm)) colMap.partId = col;
    if (["materialname", "name", "material", "itemname", "partname"].includes(norm)) colMap.partName = col;
    if (["maincategory", "maincat", "category", "cat", "main_category"].includes(norm)) colMap.mainCategory = col;
    if (["subcategory", "subcat", "sub_category", "sub-category"].includes(norm)) colMap.subCategory = col;
    if (["stock", "availablestock", "qtyinstock", "quantityinstock", "qty", "quantity", "available"].includes(norm)) colMap.availableStock = col;
  }
  // Find device columns (all columns not mapped above)
  console.log(`Column map: ${JSON.stringify(colMap)}`);
  const mappedCols = new Set(Object.values(colMap));
  const deviceCols = header.filter(col => !mappedCols.has(col));
  if (!colMap.partId || !colMap.partName || !colMap.mainCategory || !colMap.subCategory || !colMap.availableStock)
    throw new Error('Missing one or more required columns: material code, material name, main category, sub category, stock');
  if (deviceCols.length === 0) throw new Error('No device columns found in Excel');

  // Build inventory and per-device BOMs
  const inventory = [];
  const deviceBOMs = {};
  for (const device of deviceCols) deviceBOMs[device] = [];
  console.log(`rows: ${JSON.stringify(rows)}`);
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
    };
    inventory.push(invItem);

    // Per-device BOMs
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

  return { deviceBOMs, inventory };
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