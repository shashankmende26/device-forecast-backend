// Pure business logic for device deliverability forecasting
// No dependencies on DB, HTTP, Excel, or UI frameworks

/**
 * @typedef {Object} BomItem
 * @property {string|number} partId
 * @property {string} partName
 * @property {string} category
 * @property {string} subCategory
 * @property {"discrete"|"fractional"} quantityType
 * @property {number} requiredQuantityPerDevice
 */

/**
 * @typedef {Object} InventoryItem
 * @property {string|number} partId
 * @property {string} partName
 * @property {string} category
 * @property {string} subCategory
 * @property {"discrete"|"fractional"} quantityType
 * @property {number} availableStock
 */

/**
 * @typedef {Object} ForecastResult
 * @property {number} maxDeliverableQuantity Fractional (may be non-integer)
 * @property {number} maxFullDevices Integer (floor of maxDeliverableQuantity)
 * @property {Array<{partId: string|number, partName: string, capacity: number, isBottleneck: boolean}>} perPartCapacity
 * @property {Array<{partId: string|number, partName: string, capacity: number}>} bottlenecks
 */

/**
 * Forecasts device deliverability based on BOM and inventory.
 * @param {BomItem[]} bomItems
 * @param {InventoryItem[]} inventoryItems
 * @returns {ForecastResult}
 */
function forecastDeviceCapacity(bomItems, inventoryItems) {
  // Validation
  if (!Array.isArray(bomItems) || !Array.isArray(inventoryItems)) {
    throw new Error("Inputs must be arrays of BOM and inventory items");
  }
  if (bomItems.length === 0) {
    throw new Error("BOM items array is empty");
  }

  // Build inventory lookup
  const inventoryMap = new Map();
  for (const inv of inventoryItems) {
    if (!inv.partId) throw new Error("Inventory item missing partId");
    if (inventoryMap.has(inv.partId)) throw new Error(`Duplicate inventory partId: ${inv.partId}`);
    inventoryMap.set(inv.partId, inv);
  }

  // Per-part capacity calculation
  let minCapacity = Infinity;
  const perPartCapacity = [];
  for (const bom of bomItems) {
    if (!bom.partId) throw new Error("BOM item missing partId");
    if (typeof bom.requiredQuantityPerDevice !== "number" || bom.requiredQuantityPerDevice <= 0) {
      throw new Error(`Invalid requiredQuantityPerDevice for partId ${bom.partId}`);
    }
    const inv = inventoryMap.get(bom.partId);
    const availableStock = inv ? inv.availableStock : 0;
    if (typeof availableStock !== "number" || availableStock < 0) {
      throw new Error(`Invalid availableStock for partId ${bom.partId}`);
    }
    let capacity = availableStock / bom.requiredQuantityPerDevice;
    if (bom.quantityType === "discrete") {
      capacity = Math.floor(capacity);
    }
    if (!isFinite(capacity) || capacity < 0) capacity = 0;
    perPartCapacity.push({
      partId: bom.partId,
      partName: bom.partName,
      capacity,
      isBottleneck: false
    });
    if (capacity < minCapacity) minCapacity = capacity;
  }

  // Identify bottleneck(s)
  const bottlenecks = [];
  for (const part of perPartCapacity) {
    if (part.capacity === minCapacity) {
      part.isBottleneck = true;
      bottlenecks.push({ partId: part.partId, partName: part.partName, capacity: part.capacity });
    }
  }

  return {
    maxDeliverableQuantity: minCapacity,
    maxFullDevices: Math.floor(minCapacity),
    perPartCapacity,
    bottlenecks
  };
}

module.exports = { forecastDeviceCapacity };