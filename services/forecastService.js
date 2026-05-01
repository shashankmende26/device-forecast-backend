// Forecast service: orchestrates normalization and forecasting
const { forecastDeviceCapacity } = require("../forecastEngine");

/**
 * Runs forecast for a selected device using normalized BOMs and inventory
 * @param {Object<string, Array>} deviceBOMs - { [deviceCode]: BomItem[] }
 * @param {Array} inventory - InventoryItem[]
 * @param {string} deviceCode - Device code to forecast
 * @returns {Object} Forecast result (from forecast engine)
 */

// Helper: get authoritative unit price (Buy Price In Rs.) from inventory row
function getUnitPrice(inv) {
  if (inv.unitPrice !== undefined && inv.unitPrice !== null && !isNaN(Number(inv.unitPrice))) {
    return Number(inv.unitPrice);
  }
  // Fallback: try stockValue/availableStock if present
  if (inv.stockValue !== undefined && inv.availableStock > 0) {
    return Number(inv.stockValue) / Number(inv.availableStock);
  }
  return 0;
}

function runForecast(deviceBOMs, inventory, deviceCode) {
  if (!deviceBOMs[deviceCode]) {
    throw new Error(`Device code not found: ${deviceCode}`);
  }
  const bom = deviceBOMs[deviceCode];
  const forecast = forecastDeviceCapacity(bom, inventory);

  // Map inventory by partId for lookup
  const invMap = new Map();
  for (const inv of inventory) {
    invMap.set(inv.partId, inv);
  }

  // For each part in the BOM, compute before/after stock and value
  const partStockSummary = forecast.perPartCapacity.map(part => {
    const inv = invMap.get(part.partId) || {};
    const unitPrice = getUnitPrice(inv);
    const beforeStock = inv.availableStock || 0;
    const requiredPerDevice = (bom.find(b => b.partId === part.partId) || {}).requiredQuantityPerDevice || 0;
    const consumed = requiredPerDevice * forecast.maxFullDevices;
    const afterStock = Math.max(0, beforeStock - consumed);
    return {
      partId: part.partId,
      partName: part.partName,
      beforeStock,
      afterStock,
      unitPrice,
      beforeValue: beforeStock * unitPrice,
      afterValue: afterStock * unitPrice,
      isBottleneck: part.isBottleneck,
      mainCategory: inv.mainCategory,
      subCategory: inv.subCategory,
      uom: inv.uom,
      currency: inv.currency
    };
  });


  // Compute total stock value before and after forecast (for all BOM parts)
  const totalValueBefore = partStockSummary.reduce((sum, p) => sum + (typeof p.beforeValue === 'number' ? p.beforeValue : 0), 0);
  const totalValueAfter = partStockSummary.reduce((sum, p) => sum + (typeof p.afterValue === 'number' ? p.afterValue : 0), 0);

  // Compute overall inventory value summary (all inventory, not just BOM parts)
  let overallValueBefore = 0;
  let overallValueAfter = 0;
  for (const inv of inventory) {
    const unitPrice = getUnitPrice(inv);
    const before = inv.availableStock || 0;
    overallValueBefore += before * unitPrice;
    // For after, subtract consumed if this part is in BOM, else leave as is
    const bomItem = bom.find(b => b.partId === inv.partId);
    let after = before;
    if (bomItem) {
      const requiredPerDevice = bomItem.requiredQuantityPerDevice || 0;
      const consumed = requiredPerDevice * forecast.maxFullDevices;
      after = Math.max(0, before - consumed);
    }
    overallValueAfter += after * unitPrice;
  }

  return {
    ...forecast,
    partStockSummary,
    totalValueBefore, // per-device BOM only
    totalValueAfter,  // per-device BOM only
    overallValueBefore, // all inventory
    overallValueAfter   // all inventory
  };
}

module.exports = { runForecast };