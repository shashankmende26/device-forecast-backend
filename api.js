// Express API for device-forecast backend
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { normalizeExcelToBOMsAndInventory } = require('./excelNormalization');
const { runForecast } = require('./services/forecastService');

const app = express();
const upload = multer({ dest: 'uploads/' });

// In-memory storage for uploaded Excel normalization results
let lastNormalized = null;
let lastExcelPath = null;

// Upload Excel and normalize
app.post('/api/upload-excel', upload.single('file'), (req, res) => {
  try {
    const filePath = req.file.path;
    const { deviceBOMs, inventory } = normalizeExcelToBOMsAndInventory(filePath);
    lastNormalized = { deviceBOMs, inventory };
    lastExcelPath = filePath;
    // Clean up uploaded file after parsing
    fs.unlink(filePath, () => {});
    res.json({ deviceTypes: Object.keys(deviceBOMs) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// List available device types (from last upload)
app.get('/api/device-types', (req, res) => {
  if (!lastNormalized) {
    return res.status(400).json({ error: 'No Excel uploaded yet' });
  }
  res.json({ deviceTypes: Object.keys(lastNormalized.deviceBOMs) });
});

// Request forecast for a selected device
app.post('/api/forecast', express.json(), (req, res) => {
  try {
    if (!lastNormalized) {
      return res.status(400).json({ error: 'No Excel uploaded yet' });
    }
    const { deviceCode, simulatedInventory } = req.body;
    if (!deviceCode) {
      return res.status(400).json({ error: 'Missing deviceCode' });
    }
    // Use simulatedInventory if present, else use lastNormalized.inventory
    const inventoryToUse = Array.isArray(simulatedInventory) && simulatedInventory.length > 0
      ? simulatedInventory.map(item => ({ ...item, availableStock: item.afterStock ?? item.availableStock }))
      : lastNormalized.inventory;
    const result = runForecast(lastNormalized.deviceBOMs, inventoryToUse, deviceCode);
    res.json({ forecast: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

module.exports = app;
