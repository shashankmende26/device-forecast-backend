// Forecast service: orchestrates normalization and forecasting
const { forecastDeviceCapacity } = require("../forecastEngine");

/**
 * Runs forecast for a selected device using normalized BOMs and inventory
 * @param {Object<string, Array>} deviceBOMs - { [deviceCode]: BomItem[] }
 * @param {Array} inventory - InventoryItem[]
 * @param {string} deviceCode - Device code to forecast
 * @returns {Object} Forecast result (from forecast engine)
 */
function runForecast(deviceBOMs, inventory, deviceCode) {
  if (!deviceBOMs[deviceCode]) {
    throw new Error(`Device code not found: ${deviceCode}`);
  }
  const bom = deviceBOMs[deviceCode];
  return forecastDeviceCapacity(bom, inventory);
}

module.exports = { runForecast };