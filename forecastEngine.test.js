const { forecastDeviceCapacity } = require("./forecastEngine");

describe("forecastDeviceCapacity", () => {
  it("calculates correct capacity for all discrete parts", () => {
    const bom = [
      { partId: "A", partName: "Screw", category: "Mechanical", subCategory: "Fasteners", quantityType: "discrete", requiredQuantityPerDevice: 2 },
      { partId: "B", partName: "Panel", category: "Plastics", subCategory: "Panels", quantityType: "discrete", requiredQuantityPerDevice: 1 }
    ];
    const inventory = [
      { partId: "A", partName: "Screw", category: "Mechanical", subCategory: "Fasteners", quantityType: "discrete", availableStock: 5 },
      { partId: "B", partName: "Panel", category: "Plastics", subCategory: "Panels", quantityType: "discrete", availableStock: 3 }
    ];
    const result = forecastDeviceCapacity(bom, inventory);
    expect(result.maxDeliverableQuantity).toBe(2);
    expect(result.maxFullDevices).toBe(2);
    expect(result.bottlenecks).toEqual([
      { partId: "A", partName: "Screw", capacity: 2 }
    ]);
  });

  it("handles fractional (consumable) parts", () => {
    const bom = [
      { partId: "C", partName: "Glue", category: "Consumables", subCategory: "Adhesives", quantityType: "fractional", requiredQuantityPerDevice: 0.5 },
      { partId: "D", partName: "Wire", category: "Electrical", subCategory: "Wiring", quantityType: "discrete", requiredQuantityPerDevice: 2 }
    ];
    const inventory = [
      { partId: "C", partName: "Glue", category: "Consumables", subCategory: "Adhesives", quantityType: "fractional", availableStock: 2.5 },
      { partId: "D", partName: "Wire", category: "Electrical", subCategory: "Wiring", quantityType: "discrete", availableStock: 5 }
    ];
    const result = forecastDeviceCapacity(bom, inventory);
    expect(result.maxDeliverableQuantity).toBe(5);
    expect(result.maxFullDevices).toBe(5);
    expect(result.bottlenecks).toEqual([
      { partId: "D", partName: "Wire", capacity: 2 }
    ]);
  });

  it("returns zero if any required part is missing in inventory", () => {
    const bom = [
      { partId: "E", partName: "Sensor", category: "Electronics", subCategory: "Sensors", quantityType: "discrete", requiredQuantityPerDevice: 1 }
    ];
    const inventory = [];
    const result = forecastDeviceCapacity(bom, inventory);
    expect(result.maxDeliverableQuantity).toBe(0);
    expect(result.maxFullDevices).toBe(0);
    expect(result.bottlenecks).toEqual([
      { partId: "E", partName: "Sensor", capacity: 0 }
    ]);
  });

  it("handles multiple bottlenecks with same capacity", () => {
    const bom = [
      { partId: "F", partName: "Sticker", category: "Plastics", subCategory: "Stickers", quantityType: "discrete", requiredQuantityPerDevice: 2 },
      { partId: "G", partName: "Rubber Foot", category: "Plastics", subCategory: "Rubber", quantityType: "discrete", requiredQuantityPerDevice: 2 }
    ];
    const inventory = [
      { partId: "F", partName: "Sticker", category: "Plastics", subCategory: "Stickers", quantityType: "discrete", availableStock: 4 },
      { partId: "G", partName: "Rubber Foot", category: "Plastics", subCategory: "Rubber", quantityType: "discrete", availableStock: 4 }
    ];
    const result = forecastDeviceCapacity(bom, inventory);
    expect(result.maxDeliverableQuantity).toBe(2);
    expect(result.maxFullDevices).toBe(2);
    expect(result.bottlenecks).toEqual([
      { partId: "F", partName: "Sticker", capacity: 2 },
      { partId: "G", partName: "Rubber Foot", capacity: 2 }
    ]);
  });

  it("handles fractional bottleneck and reports both fractional and integer device counts", () => {
    const bom = [
      { partId: "H", partName: "Paint", category: "Consumables", subCategory: "Paints", quantityType: "fractional", requiredQuantityPerDevice: 0.3 },
      { partId: "I", partName: "Panel", category: "Plastics", subCategory: "Panels", quantityType: "discrete", requiredQuantityPerDevice: 1 }
    ];
    const inventory = [
      { partId: "H", partName: "Paint", category: "Consumables", subCategory: "Paints", quantityType: "fractional", availableStock: 1.0 },
      { partId: "I", partName: "Panel", category: "Plastics", subCategory: "Panels", quantityType: "discrete", availableStock: 10 }
    ];
    const result = forecastDeviceCapacity(bom, inventory);
    expect(result.maxDeliverableQuantity).toBeCloseTo(3.333, 2);
    expect(result.maxFullDevices).toBe(3);
    expect(result.bottlenecks).toEqual([
      { partId: "H", partName: "Paint", capacity: result.maxDeliverableQuantity }
    ]);
  });

  it("throws error for negative requiredQuantityPerDevice", () => {
    const bom = [
      { partId: "J", partName: "Keypad", category: "Electronics", subCategory: "Keypad", quantityType: "discrete", requiredQuantityPerDevice: -1 }
    ];
    const inventory = [
      { partId: "J", partName: "Keypad", category: "Electronics", subCategory: "Keypad", quantityType: "discrete", availableStock: 10 }
    ];
    expect(() => forecastDeviceCapacity(bom, inventory)).toThrow();
  });

  it("throws error for negative availableStock", () => {
    const bom = [
      { partId: "K", partName: "Switch", category: "Electronics", subCategory: "Switches", quantityType: "discrete", requiredQuantityPerDevice: 1 }
    ];
    const inventory = [
      { partId: "K", partName: "Switch", category: "Electronics", subCategory: "Switches", quantityType: "discrete", availableStock: -5 }
    ];
    expect(() => forecastDeviceCapacity(bom, inventory)).toThrow();
  });

  it("throws error for duplicate inventory partId", () => {
    const bom = [
      { partId: "L", partName: "Module", category: "Electronics", subCategory: "Modules", quantityType: "discrete", requiredQuantityPerDevice: 1 }
    ];
    const inventory = [
      { partId: "L", partName: "Module", category: "Electronics", subCategory: "Modules", quantityType: "discrete", availableStock: 2 },
      { partId: "L", partName: "Module", category: "Electronics", subCategory: "Modules", quantityType: "discrete", availableStock: 3 }
    ];
    expect(() => forecastDeviceCapacity(bom, inventory)).toThrow();
  });

  it("throws error for missing partId in BOM", () => {
    const bom = [
      { partName: "Panel", category: "Plastics", subCategory: "Panels", quantityType: "discrete", requiredQuantityPerDevice: 1 }
    ];
    const inventory = [
      { partId: "M", partName: "Panel", category: "Plastics", subCategory: "Panels", quantityType: "discrete", availableStock: 10 }
    ];
    expect(() => forecastDeviceCapacity(bom, inventory)).toThrow();
  });

  it("throws error for empty BOM array", () => {
    expect(() => forecastDeviceCapacity([], [])).toThrow();
  });
});
