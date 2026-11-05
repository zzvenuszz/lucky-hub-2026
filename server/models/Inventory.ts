import mongoose from 'mongoose';

const InventoryCategorySchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true },
}, { timestamps: true });
InventoryCategorySchema.index({ ownerId: 1, name: 1 }, { unique: true });
export const InventoryCategory = mongoose.model('InventoryCategory', InventoryCategorySchema);

const InventoryItemSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sku: { type: String, required: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryCategory', default: null },
  categoryName: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  pv: { type: Number, required: true, min: 0 },
  quantity: { type: Number, default: 0, min: 0 },
  lowStockThreshold: { type: Number, default: 5, min: 0 },
  archived: { type: Boolean, default: false },
}, { timestamps: true });
InventoryItemSchema.index({ ownerId: 1, sku: 1 }, { unique: true });
export const InventoryItem = mongoose.model('InventoryItem', InventoryItemSchema);

const InventoryLotSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true, index: true },
  receivedQuantity: { type: Number, required: true, min: 1 },
  remainingQuantity: { type: Number, required: true, min: 0 },
  unitCost: { type: Number, required: true, min: 0 },
  priceListVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PriceListVersion', default: null },
  receivedAt: { type: Date, default: Date.now },
}, { timestamps: true });
export const InventoryLot = mongoose.model('InventoryLot', InventoryLotSchema);

const InventoryMovementSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  lotId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryLot', default: null },
  type: { type: String, enum: ['receive', 'sale', 'return', 'adjustment', 'cancel'], required: true },
  quantityDelta: { type: Number, required: true },
  unitCost: { type: Number, default: 0 },
  referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
  reason: { type: String, default: '' },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });
export const InventoryMovement = mongoose.model('InventoryMovement', InventoryMovementSchema);

const PriceListVersionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, default: 'Bảng giá chung' },
  effectiveFrom: { type: Date, required: true },
  effectiveTo: { type: Date, default: null, index: true },
  entries: [{
    sku: { type: String, required: true, uppercase: true, trim: true },
    costReference: { type: Number, min: 0, default: 0 },
    price100: { type: Number, min: 0, required: true },
    price25: { type: Number, min: 0, required: true },
    price35: { type: Number, min: 0, required: true },
    price42: { type: Number, min: 0, required: true },
    price50: { type: Number, min: 0, required: true },
  }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  note: { type: String, default: '' },
}, { timestamps: true });
PriceListVersionSchema.index({ effectiveFrom: 1 }, { unique: true });
export const PriceListVersion = mongoose.model('PriceListVersion', PriceListVersionSchema);

const SaleSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  invoiceNumber: { type: String, required: true, unique: true },
  soldAt: { type: Date, required: true, index: true },
  buyerType: { type: String, enum: ['member', 'walk-in', 'custom'], required: true },
  buyerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  buyerName: { type: String, required: true, trim: true },
  buyerMemberNumber: { type: String, default: '' },
  buyerAddress: { type: String, default: '' },
  buyerPhone: { type: String, default: '' },
  sellerName: { type: String, default: '' },
  sellerAddress: { type: String, default: '' },
  sellerPhone: { type: String, default: '' },
  lines: [{
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    defaultUnitPrice: { type: Number, required: true, min: 0 },
    priceLevel: { type: String, required: true },
    priceField: { type: String, enum: ['price100', 'price25', 'price35', 'price42', 'price50'], default: 'price100' },
    pv: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },
    priceListVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PriceListVersion', default: null },
  }],
  subtotal: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 0 },
  totalPv: { type: Number, required: true, min: 0 },
  note: { type: String, default: '' },
  status: { type: String, enum: ['completed', 'partially_returned', 'returned', 'cancelled'], default: 'completed', index: true },
  returnedLines: [{ itemId: mongoose.Schema.Types.ObjectId, quantity: Number, refundAmount: Number }],
  returnEvents: [{ reason: String, note: String, refundAmount: Number, lines: [{ itemId: mongoose.Schema.Types.ObjectId, quantity: Number, refundAmount: Number }], actorId: mongoose.Schema.Types.ObjectId, createdAt: Date }],
  buyerChanges: [{ fromName: String, fromUserId: mongoose.Schema.Types.ObjectId, toName: String, toUserId: mongoose.Schema.Types.ObjectId, actorId: mongoose.Schema.Types.ObjectId, createdAt: Date }],
  cancelledAt: Date,
  cancelReason: String,
  operationLockUntil: { type: Date, default: null },
}, { timestamps: true });
SaleSchema.index({ ownerId: 1, soldAt: -1 });
SaleSchema.index({ buyerUserId: 1, soldAt: -1 });
export const Sale = mongoose.model('Sale', SaleSchema);

export const SellerPrintPreference = mongoose.model('SellerPrintPreference', new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  format: { type: String, enum: ['pdf', 'image'], default: 'pdf' },
  shopName: { type: String, default: '' },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
}, { timestamps: true }));
