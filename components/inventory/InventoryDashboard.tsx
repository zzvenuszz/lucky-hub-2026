import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Database } from '../../services/database.ts';
import InvoicePreview from './InvoicePreview.tsx';
import BarcodeScanner from './BarcodeScanner.tsx';
import ProductCreateModal from './ProductCreateModal.tsx';
import ProductEditModal from './ProductEditModal.tsx';
import CurrencyInput from './CurrencyInput.tsx';
import StockActionModal from './StockActionModal.tsx';
import BatchReceiveModal from './BatchReceiveModal.tsx';
import PriceListManager from './PriceListManager.tsx';
import InventoryReportPanel from './reports/InventoryReportPanel.tsx';
import ScrollableSubTabs from './ScrollableSubTabs.tsx';
import { User } from '../../types.ts';
import { formatVND } from '../../utils/formatters.ts';

interface Props { user: User; initialPricesOnly?: boolean; initialLevelsOnly?: boolean; initialTab?: Tab; }
type Tab = 'overview' | 'stock' | 'sale' | 'history' | 'prices' | 'reports' | 'levels' | 'settings';
type PriceField = 'price100' | 'price25' | 'price35' | 'price42' | 'price50';
const LEVELS = [
  { id: 'customer', label: 'Khách hàng', price: 'price100' },
  { id: 'member', label: 'Hội viên', price: 'price25' },
  { id: 'senior_consultant', label: 'Tư vấn viên cao cấp', price: 'price35' },
  { id: 'success_builder', label: 'Nhà kiến tạo thành công', price: 'price42' },
  { id: 'supervisor', label: 'Giám sát viên', price: 'price50' },
];
const PRICE_TIERS: Array<{ field: PriceField; label: string }> = [
  { field: 'price100', label: 'Giá Lẻ' },
  { field: 'price25', label: 'Giá -25%' },
  { field: 'price35', label: 'Giá -35%' },
  { field: 'price42', label: 'Giá -42%' },
  { field: 'price50', label: 'Giá -50%' },
];
const money = formatVND;
const toDateTimeLocalValue = (date: Date = new Date()) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
};
const parseDateTimeLocalValue = (value: string) => new Date(value);
const normalizeSkuInput = (value: string) => [...new Set(value.split(/[\n,]/).map(sku => sku.trim().toUpperCase()).filter(Boolean))];
const tabs: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'overview', label: 'Tổng quan', icon: '◫' }, { id: 'stock', label: 'Kho hàng', icon: '▣' }, { id: 'sale', label: 'Bán hàng', icon: '＋' },
  { id: 'history', label: 'Lịch sử', icon: '↻' }, { id: 'prices', label: 'Bảng giá', icon: '＄' }, { id: 'reports', label: 'Báo cáo', icon: '▤' }, { id: 'levels', label: 'Tuyến hội viên', icon: '⌘' }, { id: 'settings', label: 'Hoá đơn', icon: '⚙' },
];

const InventoryDashboard: React.FC<Props> = memo(({ user, initialPricesOnly = false, initialLevelsOnly = false, initialTab }) => {
  const permissions: string[] = (user as any).permissions || [];
  const canInventory = permissions.includes('inventory:manage');
  const canSell = permissions.includes('inventory:sell');
  const canUseInventory = canInventory || canSell;
  const canPrices = permissions.includes('pricelist:manage');
  const canManageCatalog = canPrices;
  const canLevels = permissions.includes('members:level:manage') || permissions.includes('members:level:manage:any');
  const [tab, setTab] = useState<Tab>(initialTab ? initialTab : initialLevelsOnly ? 'levels' : initialPricesOnly ? 'prices' : 'overview');
  useEffect(() => {
    if (initialTab) setTab(initialTab);
    else if (initialLevelsOnly) setTab('levels');
    else if (initialPricesOnly) setTab('prices');
  }, [initialTab, initialLevelsOnly, initialPricesOnly]);
  const [items, setItems] = useState<any[]>([]); const [categories, setCategories] = useState<any[]>([]); const [overview, setOverview] = useState<any>(null); const [movements, setMovements] = useState<any[]>([]); const [priceVersions, setPriceVersions] = useState<any[]>([]); const [salePriceList, setSalePriceList] = useState<any>(null);
  const [priceProducts, setPriceProducts] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]); const [members, setMembers] = useState<any[]>([]); const [downline, setDownline] = useState<any[]>([]); const [preference, setPreference] = useState<any>({ format: 'pdf' });
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [invoice, setInvoice] = useState<any>(null);
  const [q, setQ] = useState(''); const [memberQuery, setMemberQuery] = useState(''); const [selectedMember, setSelectedMember] = useState<any>(null);
  const [buyerAddress, setBuyerAddress] = useState(''); const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerType, setBuyerType] = useState<'member' | 'custom'>('custom'); const [customBuyer, setCustomBuyer] = useState('');
  const [draft, setDraft] = useState({ sku: '', name: '', categoryId: '', pv: '0', quantity: '0', unitCost: '0', lowStockThreshold: '5', imageUrl: '' });
  const [draftPrices, setDraftPrices] = useState({ price100: '0', price25: '0', price35: '0', price42: '0', price50: '0' });
  const [showProductModal, setShowProductModal] = useState(false);
  const [showBatchReceiveModal, setShowBatchReceiveModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [stockAction, setStockAction] = useState<{ action: 'receive' | 'adjust' | 'threshold'; item: any } | null>(null);
  const [editDraft, setEditDraft] = useState({ sku: '', name: '', categoryId: '', pv: '0', lowStockThreshold: '5', imageUrl: '' });
  const [editPrices, setEditPrices] = useState({ costReference: '0', price100: '0', price25: '0', price35: '0', price42: '0', price50: '0' });
  const [categoryTarget, setCategoryTarget] = useState<'create' | 'edit'>('create');
  const [newCategoryName, setNewCategoryName] = useState(''); const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showSaleBarcodeScanner, setShowSaleBarcodeScanner] = useState(false);
  const [cart, setCart] = useState<any[]>([]); const [note, setNote] = useState(''); const [soldAt, setSoldAt] = useState(toDateTimeLocalValue()); const [soldAtEdited, setSoldAtEdited] = useState(false);
  const [levelEntries, setLevelEntries] = useState<any[]>([]); const [reportPeriod, setReportPeriod] = useState('month'); const [memberReport, setMemberReport] = useState<any[]>([]);
  const [priceEntries, setPriceEntries] = useState<any[]>([]); const [priceEffective, setPriceEffective] = useState(toDateTimeLocalValue()); const [priceListName, setPriceListName] = useState('Bảng giá chung');
  const [pricesReady, setPricesReady] = useState(false);
  const [returnReason, setReturnReason] = useState(''); const [sellerSettings, setSellerSettings] = useState<any>({ format: 'pdf', shopName: '', phone: '', address: '' });
  const [historyQuery, setHistoryQuery] = useState('');
  const [nutritionInvoiceAddresses, setNutritionInvoiceAddresses] = useState<Array<{ id: string; name: string; address: string }>>([]);
  const [invoiceAddressSelection, setInvoiceAddressSelection] = useState('personal');
  const [invoiceAddressesReady, setInvoiceAddressesReady] = useState(false);
  const sellerProfile = { name: String(user.fullName || '').trim(), address: String(user.address || '').trim(), phone: String(user.phoneNumber || '').trim() };
  const selectedNutritionAddress = nutritionInvoiceAddresses.find(group => group.id === invoiceAddressSelection);
  const invoiceSellerAddress = selectedNutritionAddress?.address || (invoiceAddressSelection === 'personal' ? sellerProfile.address : '');
  const hasSellerDetails = Boolean(sellerProfile.name && sellerProfile.phone && invoiceSellerAddress && invoiceAddressesReady);

  const loadCore = useCallback(async () => {
    if (!canUseInventory) return;
    try {
      const [loadedItems, loadedSales, pref, loadedOverview, loadedMovements, loadedCategories] = await Promise.all([
        Database.inventory.getItems(),
        Database.inventory.getSales(),
        Database.inventory.printPreference(),
        Database.inventory.overview(),
        Database.inventory.movements(),
        Database.inventory.getCategories(),
      ]);
      setItems(loadedItems || []);
      setSales(loadedSales?.sales || []);
      if (pref) { setPreference(pref); setSellerSettings(pref); }
      setCategories(loadedCategories || []);
      setOverview(loadedOverview);
      setMovements(loadedMovements || []);
    } catch (error: any) { console.error('[InventoryUI] Load failed:', error); setMessage(error.message || 'Không thể tải dữ liệu kho.'); }
  }, [canUseInventory]);
  const loadPrices = useCallback(async () => {
    if (!canPrices && !canUseInventory) return;
    setPricesReady(false);
    try {
      const [result, catalog] = await Promise.all([Database.inventory.priceList(), canPrices ? Database.inventory.priceListProducts() : Promise.resolve(items)]); setPriceVersions(result?.versions || []); setPriceProducts(catalog || []);
      if (result?.active?.name) setPriceListName(result.active.name);
      const entries = (result?.active?.entries || []).map((entry: any) => ({ ...entry }));
      const known = new Set(entries.map((entry: any) => entry.sku));
      for (const item of items) if (!item.archived) for (const sku of item.skus?.length ? item.skus : [item.sku]) if (!known.has(sku)) {
        const primary = entries.find((entry: any) => entry.sku === item.sku) || item.prices || {};
        entries.push({ ...primary, sku, costReference: Number(primary.costReference || 0), price100: Number(primary.price100 || 0), price25: Number(primary.price25 || 0), price35: Number(primary.price35 || 0), price42: Number(primary.price42 || 0), price50: Number(primary.price50 || 0) });
        known.add(sku);
      }
      setPriceEntries(entries);
      setPricesReady(true);
    } catch (error: any) { console.error('[InventoryUI] Price load failed:', error); setMessage(error.message); }
  }, [canPrices, canUseInventory, items]);
  useEffect(() => { loadCore(); }, [loadCore]);
  useEffect(() => { loadPrices(); }, [loadPrices]);
  useEffect(() => {
    let active = true;
    setInvoiceAddressesReady(false);
    Database.getNutritionGroups().then((groups: any[]) => {
      if (!active) return;
      const currentUserId = String(user.id || user._id || '');
      const getId = (value: any) => String(value?._id || value?.id || value || '');
      const operated = (groups || []).filter((group: any) => getId(group.ownerId) === currentUserId || (group.coOwners || []).some((coOwner: any) => getId(coOwner) === currentUserId))
        .map((group: any) => ({ id: String(group.id || group._id), name: String(group.name || 'Nhóm dinh dưỡng'), address: String(group.address || '').trim() }))
        .filter((group: any) => group.id && group.address);
      setNutritionInvoiceAddresses(operated);
      setInvoiceAddressSelection(current => current !== 'personal' && operated.some((group: any) => group.id === current) ? current : operated[0]?.id || 'personal');
      console.log('[InventoryUI] Invoice address choices loaded:', { nddCount: operated.length });
      setInvoiceAddressesReady(true);
    }).catch(error => {
      console.error('[InventoryUI] Invoice address lookup failed:', error);
      if (active) { setNutritionInvoiceAddresses([]); setInvoiceAddressSelection('personal'); setInvoiceAddressesReady(true); }
    });
    return () => { active = false; };
  }, [user.id, user._id]);
  useEffect(() => { if (tab === 'levels' && canLevels) Database.inventory.downline().then(data => setDownline(data || [])).catch(error => setMessage(error.message)); }, [tab, canLevels]);
  useEffect(() => {
    if (tab !== 'sale' || !canUseInventory) return;
    const at = soldAtEdited ? parseDateTimeLocalValue(soldAt) : new Date();
    if (Number.isNaN(at.getTime())) return;
    let active = true;
    console.log('[InventoryUI] Sale price lookup:', { at: at.toISOString(), editedSaleTime: soldAtEdited });
    Database.inventory.priceList(at.toISOString())
      .then(result => { if (active) setSalePriceList(result?.active || null); })
      .catch(error => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [tab, soldAt, soldAtEdited, canUseInventory]);
  useEffect(() => { if (!salePriceList || !cart.length) return; const levelInfo = LEVELS.find(entry => entry.id === (selectedMember?.memberLevel || 'customer')) || LEVELS[0]; setCart(lines => lines.map(line => { const entry = salePriceList.entries?.find((price: any) => price.sku === (line.priceSku || line.sku)) || salePriceList.entries?.find((price: any) => (line.skus || []).includes(price.sku)); if (!entry) return line; const nextDefaultField = levelInfo.price; const selectedField = line.manualPriceLevel ? line.priceField : nextDefaultField; return { ...line, defaultPriceField: nextDefaultField, defaultUnitPrice: Number(entry[nextDefaultField] || 0), priceField: selectedField, priceLevel: PRICE_TIERS.find(tier => tier.field === selectedField)?.label || 'Giá Lẻ', unitPrice: Number(entry[selectedField] || 0) }; })); }, [salePriceList, selectedMember]);
  useEffect(() => { if (tab === 'history' && canUseInventory) Database.inventory.getSales().then(result => setSales(result?.sales || [])).catch(error => setMessage(error.message)); }, [tab, canUseInventory]);
  useEffect(() => { if (memberQuery.trim().length < 2) { setMembers([]); return; } const timer = window.setTimeout(() => Database.inventory.findMembers(memberQuery).then(data => setMembers(data || [])).catch(error => setMessage(error.message)), 250); return () => window.clearTimeout(timer); }, [memberQuery]);

  const visibleTabs = useMemo(() => tabs.filter(item => {
    if (item.id === 'prices') return canPrices || canUseInventory;
    if (item.id === 'levels') return canLevels;
    if (item.id === 'settings') return canUseInventory;
    if (item.id === 'sale' || item.id === 'history' || item.id === 'reports' || item.id === 'overview' || item.id === 'stock') return canUseInventory;
    return canInventory;
  }), [canInventory, canPrices, canLevels, canUseInventory]);
  useEffect(() => { if (!visibleTabs.some(item => item.id === tab)) setTab(visibleTabs[0]?.id || 'prices'); }, [visibleTabs, tab]);
  const showMessage = useCallback((text: string) => { setMessage(text); }, []);
  useEffect(() => { if (!message) return; const timer = window.setTimeout(() => setMessage(''), 4500); return () => window.clearTimeout(timer); }, [message]);
  const reload = useCallback(async () => { await loadCore(); await loadPrices(); }, [loadCore, loadPrices]);
  const filteredItems = items.filter(item => `${item.name} ${item.sku} ${(item.skus || []).join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  // Sản phẩm đã ngừng bán vẫn được bán tiếp nếu kho cá nhân còn tồn > 0 cho đến khi tồn = 0
  const saleItems = filteredItems.filter(item => !item.archived || Number(item.quantity || 0) > 0);
  const filteredSales = sales.filter(sale => `${sale.invoiceNumber} ${sale.buyerName} ${sale.lines?.map((line: any) => `${line.name} ${line.sku}`).join(' ')}`.toLowerCase().includes(historyQuery.toLowerCase()));
  const updateCartLine = (id: string, patch: any) => setCart(lines => lines.map(line => line.itemId === id ? { ...line, ...patch } : line));
  const addToCart = (item: any, scannedSku = item.sku) => {
    if (Number(item.quantity || 0) <= 0) {
      showMessage(`Sản phẩm ${item.name} chưa có tồn kho trong kho cá nhân của bạn.`);
      return;
    }
    const existing = cart.find(line => line.itemId === item.id);
    if (existing) updateCartLine(item.id, { quantity: Math.min(item.quantity, existing.quantity + 1) });
    else {
      const level = selectedMember?.memberLevel || 'customer'; const levelInfo = LEVELS.find(entry => entry.id === level) || LEVELS[0];
      const price = salePriceList?.entries?.find((entry: any) => entry.sku === item.sku) || salePriceList?.entries?.find((entry: any) => (item.skus || [item.sku]).includes(entry.sku));
      setCart(lines => [...lines, { itemId: item.id, sku: scannedSku, priceSku: item.sku, skus: item.skus || [item.sku], name: item.name, pv: item.pv, available: item.quantity, quantity: 1, priceField: levelInfo.price, defaultPriceField: levelInfo.price, manualPriceLevel: false, unitPrice: Number(price?.[levelInfo.price] || 0), defaultUnitPrice: Number(price?.[levelInfo.price] || 0), priceLevel: PRICE_TIERS.find(tier => tier.field === levelInfo.price)?.label || 'Giá Lẻ' }]);
    }
  };
  const handleSaleBarcodeDetected = useCallback((value: string) => {
    const sku = value.trim().toUpperCase();
    const item = items.find(candidate => (candidate.skus?.length ? candidate.skus : [candidate.sku]).includes(sku));
    setShowSaleBarcodeScanner(false);
    if (!item) { showMessage(`Không tìm thấy SKU ${sku} trong kho của bạn.`); return; }
    if (Number(item.quantity) < 1) { showMessage(`${item.name} hiện đã hết hàng trong kho cá nhân của bạn.`); return; }
    addToCart(item, sku);
    showMessage(`Đã quét ${sku} · ${item.name}.`);
  }, [items, addToCart, showMessage]);
  const total = cart.reduce((sum, line) => sum + line.quantity * Number(line.unitPrice || 0), 0);
  const totalPv = cart.reduce((sum, line) => sum + line.quantity * Number(line.pv || 0), 0);
  const submitSale = async () => {
    if (!cart.length) return showMessage('Hãy chọn ít nhất một mặt hàng.');
    if (!hasSellerDetails) return showMessage(!sellerProfile.name || !sellerProfile.phone ? 'Hãy cập nhật họ tên và số điện thoại trong hồ sơ người bán.' : 'Hãy chọn địa chỉ NDD hoặc cập nhật địa chỉ cá nhân trong hồ sơ người bán.');
    if (!buyerAddress.trim() || !buyerPhone.trim()) return showMessage('Cần nhập địa chỉ và số điện thoại người mua để hoàn tất đơn hàng.');
    setBusy(true);
    try {
      const saleTime = soldAtEdited ? parseDateTimeLocalValue(soldAt) : new Date();
      if (Number.isNaN(saleTime.getTime())) throw new Error('Thời gian bán hàng không hợp lệ.');
      const result = await Database.inventory.saveSale({ buyerType, buyerUserId: selectedMember?.id, buyerName: buyerType === 'custom' ? customBuyer.trim() : selectedMember?.fullName, buyerAddress: buyerAddress.trim(), buyerPhone: buyerPhone.trim(), sellerAddressGroupId: selectedNutritionAddress?.id, lines: cart.map(line => ({ itemId: line.itemId, sku: line.sku, quantity: Number(line.quantity), priceField: line.priceField })), soldAt: saleTime.toISOString(), note });
      if (result) { setInvoice(result); setCart([]); setNote(''); setSelectedMember(null); setBuyerType('custom'); setCustomBuyer(''); setBuyerAddress(''); setBuyerPhone(''); setSoldAt(toDateTimeLocalValue()); setSoldAtEdited(false); showMessage(`Đã tạo hoá đơn ${result.invoiceNumber}.`); await reload(); }
    } catch (error: any) { showMessage(error.message || 'Không thể lưu hoá đơn.'); }
    finally { setBusy(false); }
  };
  const addProduct = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    try {
      const skuList = normalizeSkuInput(draft.sku);
      if (!skuList.length) throw new Error('Nhập ít nhất một SKU hợp lệ.');
      const sku = skuList[0];
      const created = await Database.inventory.createItem({ ...draft, sku, skus: skuList, pv: Number(draft.pv), quantity: 0, unitCost: Number(draft.unitCost), lowStockThreshold: Number(draft.lowStockThreshold) });
      if (!created) throw new Error('Máy chủ chưa xác nhận đã tạo sản phẩm. Hãy thử lại.');
      const createdItem = { ...created, id: String(created.id || created._id), sku, skus: skuList, quantity: 0 };
      setQ('');
      setItems(old => [createdItem, ...old.filter(item => String(item.id || item._id) !== createdItem.id)]);
      if (canPrices) {
        const priceEntry = { name: draft.name.trim(), pv: Number(draft.pv), categoryName: categories.find((category: any) => String(category._id) === draft.categoryId)?.name || '', costReference: Number(draft.unitCost), price100: Number(draftPrices.price100), price25: Number(draftPrices.price25), price35: Number(draftPrices.price35), price42: Number(draftPrices.price42), price50: Number(draftPrices.price50) };
        const nextEntries = [...priceEntries.filter((entry: any) => !skuList.includes(entry.sku)), ...skuList.map(skuCode => ({ ...priceEntry, sku: skuCode }))];
        try {
          const effectiveFrom = new Date(); effectiveFrom.setSeconds(0, 0);
          await Database.inventory.savePriceList({ name: priceListName || 'Bảng giá chung', effectiveFrom: effectiveFrom.toISOString(), entries: nextEntries, note: `Thêm SKU ${sku} cùng lúc tạo mẫu sản phẩm` });
          console.log('[InventoryUI] New product price tiers saved:', { skus: skuList });
        } catch (priceError: any) {
          setShowProductModal(false);
          setDraft({ sku: '', name: '', categoryId: '', pv: '0', quantity: '0', unitCost: '0', lowStockThreshold: '5', imageUrl: '' });
          setDraftPrices({ price100: '0', price25: '0', price35: '0', price42: '0', price50: '0' });
          showMessage(`Đã tạo mẫu sản phẩm ${sku}, nhưng chưa lưu được bảng giá: ${priceError.message || 'hãy cập nhật trong mục Bảng giá.'}`);
          void reload().then(() => setItems(old => old.some(item => String(item.id || item._id) === createdItem.id) ? old : [createdItem, ...old]));
          return;
        }
      }
      setDraft({ sku: '', name: '', categoryId: '', pv: '0', quantity: '0', unitCost: '0', lowStockThreshold: '5', imageUrl: '' });
      setDraftPrices({ price100: '0', price25: '0', price35: '0', price42: '0', price50: '0' });
      setShowProductModal(false);
      showMessage(`Đã thêm mẫu sản phẩm ${createdItem.name || sku} thành công.`);
      void reload().then(() => setItems(old => old.some(item => String(item.id || item._id) === createdItem.id) ? old : [createdItem, ...old]));
    }
    catch (error: any) { showMessage(error.message); } finally { setBusy(false); }
  };
  const receiveStock = (item: any) => setStockAction({ action: 'receive', item });
  const adjustStock = (item: any) => setStockAction({ action: 'adjust', item });
  const editThreshold = (item: any) => setStockAction({ action: 'threshold', item });
  const submitStockAction = async (payload: { quantity?: number; quantityDelta?: number; unitCost: number; reason?: string; receivedAt?: string; lowStockThreshold?: number }) => {
    if (!stockAction) return;
    const item = stockAction.item; const itemId = item.id || item._id;
    setBusy(true);
    try {
      if (stockAction.action === 'threshold') {
        await Database.inventory.updateThreshold(itemId, Number(payload.lowStockThreshold ?? 0));
        console.log('[InventoryUI] Personal threshold updated:', { itemId, lowStockThreshold: payload.lowStockThreshold });
        setStockAction(null); await reload(); showMessage(`Đã cập nhật ngưỡng cảnh báo tồn cho ${item.name}.`);
      } else if (stockAction.action === 'receive') {
        await Database.inventory.receiveStock(itemId, { quantity: payload.quantity, unitCost: payload.unitCost, receivedAt: payload.receivedAt, reason: payload.reason });
        console.log('[InventoryUI] Stock received:', { itemId, quantity: payload.quantity, receivedAt: payload.receivedAt });
        setStockAction(null); await reload(); showMessage('Đã nhập kho thành công.');
      } else {
        await Database.inventory.adjustStock(itemId, { quantityDelta: payload.quantityDelta, reason: payload.reason, unitCost: payload.unitCost });
        console.log('[InventoryUI] Stock adjusted:', { itemId, quantityDelta: payload.quantityDelta });
        setStockAction(null); await reload(); showMessage('Đã điều chỉnh tồn kho.');
      }
    } catch (error: any) { showMessage(error.message); }
    finally { setBusy(false); }
  };
  const submitBatchReceive = useCallback(async (payload: { receivedAt: string; reason: string; lines: Array<{ itemId: string; sku: string; quantity: number; unitCost: number }> }) => {
    setBusy(true);
    try {
      const res = await Database.inventory.receiveBatch(payload);
      console.log('[InventoryUI] Batch stock received:', res);
      setShowBatchReceiveModal(false);
      await reload();
      showMessage(`Đã nhập kho ${res?.receivedCount || payload.lines.length} mặt hàng (tổng ${res?.totalQuantity || 0} SP) và lưu nhật ký nhập kho.`);
    } catch (error: any) {
      console.error('[InventoryUI] Batch receive failed:', error);
      showMessage(error.message || 'Không thể nhập kho.');
    } finally {
      setBusy(false);
    }
  }, [reload, showMessage]);
  const editProduct = (item: any) => {
    if (Number(item.otherUsersStock || 0) > 0) {
      const warning = `Không thể sửa mẫu sản phẩm “${item.name}” vì đang có người dùng khác còn tồn kho (${item.otherUsersStock} sản phẩm).`;
      alert(warning);
      showMessage(warning);
      return;
    }
    const entry = priceEntries.find((price: any) => price.sku === item.sku) || item.prices || {};
    setEditingProduct(item);
    setEditDraft({ sku: (item.skus?.length ? item.skus : [item.sku]).join(', '), name: item.name || '', categoryId: item.categoryId ? String(item.categoryId) : '', pv: String(item.pv ?? 0), lowStockThreshold: String(item.lowStockThreshold ?? 5), imageUrl: item.imageUrl || '' });
    setEditPrices({ costReference: String(entry.costReference ?? 0), price100: String(entry.price100 ?? 0), price25: String(entry.price25 ?? 0), price35: String(entry.price35 ?? 0), price42: String(entry.price42 ?? 0), price50: String(entry.price50 ?? 0) });
  };
  const saveEditedProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingProduct) return;
    const skuList = normalizeSkuInput(editDraft.sku); const sku = skuList[0]; const pv = Number(editDraft.pv); const lowStockThreshold = Number(editDraft.lowStockThreshold);
    if (!skuList.length || !editDraft.name.trim() || !Number.isFinite(pv) || pv < 0 || !Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) return showMessage('SKU, tên sản phẩm, PV hoặc ngưỡng tồn không hợp lệ.');
    const priceValues = Object.values(editPrices).map(Number);
    if (canPrices && priceValues.some(value => !Number.isSafeInteger(value) || value < 0)) return showMessage('Giá vốn và các mức giá phải là số nguyên không âm.');
    setBusy(true);
    let itemSaved = false;
    try {
      const updatedItem = await Database.inventory.updateItem(editingProduct.id || editingProduct._id, { ...editDraft, sku, skus: skuList, name: editDraft.name.trim(), pv, lowStockThreshold });
      itemSaved = true;
      setEditingProduct((old: any) => old ? { ...old, ...updatedItem, id: String(updatedItem?.id || updatedItem?._id || old.id || old._id) } : old);
      if (canPrices) {
        const nextEntry = { name: editDraft.name.trim(), pv, categoryName: categories.find((category: any) => String(category._id) === editDraft.categoryId)?.name || '', costReference: Number(editPrices.costReference), price100: Number(editPrices.price100), price25: Number(editPrices.price25), price35: Number(editPrices.price35), price42: Number(editPrices.price42), price50: Number(editPrices.price50) };
        const currentEntry = priceEntries.find((entry: any) => entry.sku === editingProduct.sku) || editingProduct.prices || {};
        const oldSkus = editingProduct.skus?.length ? editingProduct.skus : [editingProduct.sku];
        const skuSetChanged = JSON.stringify([...oldSkus].sort()) !== JSON.stringify([...skuList].sort());
        const priceChanged = skuSetChanged || Object.entries(nextEntry).some(([key, value]) => Number(currentEntry[key] ?? 0) !== value);
        if (priceChanged) {
          const nextEntries = [...priceEntries.filter((entry: any) => !oldSkus.includes(entry.sku) && !skuList.includes(entry.sku)), ...skuList.map(skuCode => ({ ...nextEntry, sku: skuCode }))];
          await Database.inventory.savePriceList({ name: priceListName || 'Bảng giá chung', effectiveFrom: new Date().toISOString(), entries: nextEntries, note: `Sửa thông tin và giá sản phẩm ${sku}` });
        }
      }
      console.log('[InventoryUI] Product updated:', { itemId: editingProduct.id || editingProduct._id, sku, priceListUpdated: canPrices });
      setEditingProduct(null); await reload(); showMessage(`Đã cập nhật sản phẩm ${sku}.`);
    } catch (error: any) {
      await reload();
      showMessage(`${error.message || 'Không thể cập nhật sản phẩm.'}${canPrices && itemSaved ? ' Thông tin sản phẩm đã lưu nhưng bảng giá chưa được cập nhật.' : ''}`);
    } finally { setBusy(false); }
  };
  const archiveProduct = async (item: any) => {
    const archived = !item.archived;
    const otherStockNote = Number(item.otherUsersStock || 0) > 0 ? ` Lưu ý: Kho của người dùng khác hiện còn ${item.otherUsersStock} sản phẩm.` : '';
    const confirmText = archived
      ? `Ngừng sản phẩm “${item.name}”?${otherStockNote} Khi ngừng sản phẩm sẽ không cho phép nhập thêm hàng mới, nhưng những sản phẩm đã nhập kho vẫn có thể bán tiếp đến khi số lượng tồn kho = 0.`
      : `Mở bán lại sản phẩm “${item.name}”? Người dùng sẽ có thể nhập kho lại sản phẩm này.`;
    if (!confirm(confirmText)) return;
    try { await Database.inventory.updateItem(item.id || item._id, { archived }); await reload(); showMessage(archived ? 'Đã ngừng nhập thêm sản phẩm; hàng tồn trong kho vẫn được bán đến khi hết.' : 'Đã mở lại sản phẩm.'); }
    catch (error: any) { showMessage(error.message); }
  };
  const deleteProduct = async (item: any) => {
    const totalStock = Number(item.totalSystemStock ?? item.quantity ?? 0);
    if (totalStock > 0) {
      const warning = `Không thể xóa sản phẩm “${item.name}” vì tổng tồn kho hiện tại là ${totalStock} sản phẩm. Chỉ cho phép xóa khi tồn kho của tất cả mọi người cho sản phẩm đó = 0.`;
      alert(warning);
      showMessage(warning);
      return;
    }
    if (!confirm(`Xóa hẳn mẫu sản phẩm ${item.name} (${item.sku})? Thao tác này không thể hoàn tác. Sản phẩm đã có hóa đơn sẽ không thể xóa.`)) return;
    try { await Database.inventory.deleteItem(item.id || item._id); await reload(); showMessage(`Đã xóa hẳn sản phẩm ${item.name}.`); }
    catch (error: any) { showMessage(error.message || 'Không thể xóa sản phẩm.'); }
  };
  const createCategory = async () => { const name = newCategoryName.trim(); if (!name) return; try { const category = await Database.inventory.createCategory(name); setCategories(old => [...old, category].sort((a, b) => a.name.localeCompare(b.name, 'vi'))); if (categoryTarget === 'edit') setEditDraft(old => ({ ...old, categoryId: category._id })); else setDraft(old => ({ ...old, categoryId: category._id })); setNewCategoryName(''); setShowCategoryModal(false); showMessage(`Đã tạo danh mục “${category.name}”.`); } catch (error: any) { showMessage(error.message); } };
  const handleBarcodeDetected = useCallback((sku: string) => { setDraft(old => ({ ...old, sku })); setShowBarcodeScanner(false); showMessage(`Đã quét SKU ${sku}.`); }, [showMessage]);
  const saveLevel = async (member: any) => { const level = levelEntries.find(entry => entry.id === member.id)?.value || member.memberLevel; const reason = levelEntries.find(entry => entry.id === member.id)?.reason || ''; try { await Database.inventory.setMemberLevel(member.id, { memberLevel: level, reason }); showMessage(`Đã cập nhật cấp độ ${member.fullName}.`); setDownline(await Database.inventory.downline() || []); } catch (error: any) { showMessage(error.message); } };
  const openMemberPurchases = useCallback(async (memberId: string) => { try { const result = await Database.inventory.memberPurchases(memberId); setSales(result?.sales || []); setTab('history'); } catch (error: any) { showMessage(error.message); } }, [showMessage]);
  const handleReturn = async (sale: any) => { const reason = prompt('Nhập lý do trả hàng:'); if (!reason?.trim()) return; const line = sale.lines.find((entry: any) => (sale.returnedLines || []).filter((ret: any) => ret.itemId === entry.itemId).reduce((s: number, ret: any) => s + ret.quantity, 0) < entry.quantity); if (!line) return showMessage('Hoá đơn này đã hoàn đủ hàng.'); const already = (sale.returnedLines || []).filter((ret: any) => ret.itemId === line.itemId).reduce((s: number, ret: any) => s + ret.quantity, 0); const remaining = line.quantity - already; const qty = Number(prompt(`Số lượng trả (${line.name}, tối đa ${remaining}):`, String(remaining))); if (!Number.isInteger(qty) || qty < 1 || qty > remaining) return; try { await Database.inventory.returnSale(sale._id, { reason, lines: [{ itemId: line.itemId, quantity: qty }] }); await reload(); showMessage('Đã ghi nhận hoàn hàng.'); } catch (error: any) { showMessage(error.message); } };
  const cancelSale = async (sale: any) => { const reason = prompt('Nhập lý do huỷ đơn:'); if (!reason?.trim()) return; if (!confirm(`Huỷ hoá đơn ${sale.invoiceNumber} và trả hàng về kho?`)) return; try { await Database.inventory.cancelSale(sale._id, reason); await reload(); showMessage('Đã huỷ hoá đơn và hoàn kho.'); } catch (error: any) { showMessage(error.message); } };
  const deleteCancelledSale = useCallback(async (sale: any) => {
    if (sale.status !== 'cancelled') return showMessage('Chỉ có thể xóa những hóa đơn đang ở trạng thái đã hủy.');
    if (!confirm(`Xóa vĩnh viễn hóa đơn đã hủy ${sale.invoiceNumber}? Thao tác này không thể hoàn tác.`)) return;
    setBusy(true);
    try {
      console.log('[InventoryUI] Deleting cancelled sale:', { saleId: sale._id, invoiceNumber: sale.invoiceNumber });
      await Database.inventory.deleteSale(sale._id);
      await reload();
      showMessage(`Đã xóa hóa đơn đã hủy ${sale.invoiceNumber}.`);
    } catch (error: any) {
      console.error('[InventoryUI] Delete cancelled sale failed:', error);
      showMessage(error.message || 'Không thể xóa hóa đơn đã hủy.');
    } finally {
      setBusy(false);
    }
  }, [reload, showMessage]);
  const cancelledSalesCount = useMemo(() => sales.filter(sale => sale.status === 'cancelled').length, [sales]);
  const deleteAllCancelledSales = useCallback(async () => {
    if (!cancelledSalesCount) return showMessage('Không có hóa đơn đã hủy nào để xóa.');
    if (!confirm(`Xóa vĩnh viễn tất cả ${cancelledSalesCount} hóa đơn đang ở trạng thái đã hủy? Thao tác này không thể hoàn tác.`)) return;
    setBusy(true);
    try {
      console.log('[InventoryUI] Deleting all cancelled sales:', { count: cancelledSalesCount });
      const res = await Database.inventory.deleteCancelledSales();
      await reload();
      showMessage(`Đã xóa ${res?.deletedCount ?? cancelledSalesCount} hóa đơn đã hủy.`);
    } catch (error: any) {
      console.error('[InventoryUI] Delete all cancelled sales failed:', error);
      showMessage(error.message || 'Không thể xóa các hóa đơn đã hủy.');
    } finally {
      setBusy(false);
    }
  }, [cancelledSalesCount, reload, showMessage]);
  const changeBuyer = async (sale: any) => { const option = prompt('Người mua mới: 1 = Hội viên, 2 = Khách lẻ', '1'); if (!option) return; let payload: any; let member: any = null; if (option === '1') { const memberNumber = prompt('Nhập mã hoặc tên người mua:'); if (!memberNumber) return; const found = await Database.inventory.findMembers(memberNumber); if (!found?.length) return showMessage('Không tìm thấy người mua.'); member = found[0]; payload = { buyerType: 'member', buyerUserId: member.id }; } else if (option === '2') { const buyerName = prompt('Nhập tên khách lẻ:'); if (!buyerName?.trim()) return; payload = { buyerType: 'custom', buyerName: buyerName.trim() }; } else return; const buyerAddressValue = prompt('Địa chỉ người mua:', member?.address || '') ; if (buyerAddressValue === null || !buyerAddressValue.trim()) return showMessage('Cần nhập địa chỉ người mua.'); const buyerPhoneValue = prompt('Số điện thoại người mua:', member?.phoneNumber || ''); if (buyerPhoneValue === null || !buyerPhoneValue.trim()) return showMessage('Cần nhập số điện thoại người mua.'); payload.buyerAddress = buyerAddressValue.trim(); payload.buyerPhone = buyerPhoneValue.trim(); try { const result = await Database.inventory.changeBuyer(sale._id, payload); setInvoice(result); await reload(); showMessage('Đã chuyển người mua; PV và giá bán được giữ nguyên.'); } catch (error: any) { showMessage(error.message); } };
  const saveSettings = async () => { try { const saved = await Database.inventory.savePrintPreference({ ...sellerSettings, shopName: sellerProfile.name, phone: sellerProfile.phone, address: sellerProfile.address }); setSellerSettings(saved); setPreference(saved); showMessage('Đã lưu định dạng hóa đơn.'); } catch (error: any) { showMessage(error.message); } };

  const uploadImage = (file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = () => setDraft(old => ({ ...old, imageUrl: String(reader.result || '') })); reader.readAsDataURL(file); };
  const uploadEditImage = (file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = () => setEditDraft(old => ({ ...old, imageUrl: String(reader.result || '') })); reader.readAsDataURL(file); };
  const levelLabels: any = Object.fromEntries(LEVELS.map(level => [level.id, level.label]));
  const getMemberLevelLabel = (memberLevel?: string) => levelLabels[memberLevel || 'customer'] || levelLabels.customer;
  const getMemberNameLabel = (member: any) => String(member?.fullName || '').trim() || 'Hội viên';
  const getMemberIdentityLabel = (member: any) => {
    const rawMemberNumber = String(member?.memberNumber || '').trim();
    const memberNumber = ['undefined', 'null'].includes(rawMemberNumber.toLowerCase()) ? '' : rawMemberNumber;
    return `${getMemberNameLabel(member)} · ${memberNumber || getMemberLevelLabel(member?.memberLevel)}`;
  };
  return <section className="mx-auto max-w-7xl space-y-6 px-3 pb-24 pt-4 sm:px-6 lg:px-8" data-testid="inventory-dashboard">
    <header className="flex flex-col justify-between gap-4 rounded-[2rem] bg-gradient-to-br from-emerald-950 via-emerald-800 to-teal-600 p-6 text-white shadow-xl sm:flex-row sm:items-center sm:p-8"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.24em] text-emerald-200">Lucky Hub · Bán hàng</p><h1 className="mt-2 text-xl font-black leading-tight sm:text-2xl lg:text-3xl">{canUseInventory ? <><span className="block whitespace-nowrap uppercase tracking-tight">KHO HÀNG CÁ NHÂN</span><span className="mt-1 block truncate text-base font-bold text-emerald-100 sm:text-xl lg:text-2xl">{user.fullName}</span></> : tab === 'levels' ? (permissions.includes('members:level:manage:any') ? 'Quản lý cấp độ hội viên' : 'Quản lý cấp độ tuyến dưới') : 'Bảng giá sản phẩm'}</h1><p className="mt-2 max-w-xl text-sm text-emerald-100">{canUseInventory ? 'Quản lý tồn kho riêng từ mẫu sản phẩm chung, giá bán theo cấp hội viên và lịch sử hoá đơn.' : tab === 'levels' ? 'Cập nhật cấp độ hội viên theo phạm vi quyền được cấp.' : 'Quản lý bảng giá chung và thời gian áp dụng.'}</p></div>{canUseInventory && <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm"><div className="font-bold">Mã hội viên: {user.memberNumber || 'Chưa cập nhật'}</div><div className="mt-1 text-emerald-100">Cấp độ: {getMemberLevelLabel(user.memberLevel)}</div></div>}</header>
    {message && <div role="status" aria-live="polite" className="fixed right-3 top-3 z-[160] flex w-[calc(100%-1.5rem)] max-w-md items-start gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-bold text-emerald-900 shadow-xl sm:right-6 sm:top-6"><span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-800">✓</span><span className="flex-1 pt-1">{message}</span><button type="button" aria-label="Đóng thông báo" onClick={() => setMessage('')} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">✕</button></div>}
    <ScrollableSubTabs tabs={visibleTabs} activeTab={tab} onSelect={setTab} />

    {tab === 'overview' && canUseInventory && <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Mặt hàng', overview?.itemCount || 0], ['Tổng sản phẩm', overview?.totalUnits || 0], ['Giá vốn tồn kho', money(overview?.costValue || 0)], ['Sản phẩm cần nhập', overview?.lowStock?.length || 0]].map(([label, value]) => <div key={String(label)} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-3 break-words text-xl font-black text-slate-900 sm:text-2xl">{value}</p></div>)}</div>
      <div className="grid gap-5 lg:grid-cols-2"><div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><h2 className="font-black">Ước tính giá trị bán ra</h2><div className="mt-4 grid grid-cols-2 gap-3">{PRICE_TIERS.map(({ label, field }) => <div key={field} className="rounded-2xl bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-black">{money(overview?.estimated?.[field] || 0)}</div></div>)}</div></div>
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><h2 className="font-black">Cảnh báo tồn kho</h2>{overview?.lowStock?.length ? <ul className="mt-3 space-y-2">{overview.lowStock.map((item: any) => <li key={item.id} className="flex justify-between rounded-xl bg-amber-50 px-4 py-3 text-sm"><span className="font-bold">{item.name} <small className="text-slate-500">{item.sku}</small></span><b className="text-amber-800">Còn {item.quantity} / {item.threshold}</b></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">Không có mặt hàng tồn thấp.</p>}</div></div>
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><h2 className="font-black">Bán hàng gần đây</h2><div className="mt-3 space-y-2">{(overview?.recentSales || []).slice(0, 6).map((sale: any) => <button key={sale._id} onClick={() => { setInvoice(sale); setTab('history'); }} className="flex w-full justify-between rounded-xl bg-slate-50 p-3 text-left text-sm"><span>{sale.invoiceNumber} · {sale.buyerName}</span><b>{money(sale.total)}</b></button>)}</div></div>
    </div>}

    {tab === 'stock' && canUseInventory && <div className="space-y-5">
      <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6">
        <div className="space-y-3">
          <h2 className="text-lg font-black">Kho của tôi</h2>
          <div className="flex w-full items-center gap-2" data-testid="stock-toolbar-row">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm SKU hoặc tên hàng" className="min-w-0 flex-1 rounded-xl bg-slate-100 px-3 py-2.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500 sm:px-4 sm:py-3 sm:text-sm" />
            <button type="button" aria-label="Nhập hàng" data-testid="open-batch-receive" onClick={() => setShowBatchReceiveModal(true)} className="shrink-0 whitespace-nowrap rounded-xl bg-teal-700 px-3 py-2.5 text-xs font-black text-white shadow-sm hover:bg-teal-800 sm:px-4 sm:py-3 sm:text-sm">+ Thêm</button>
            {canManageCatalog && <button type="button" aria-label="Thêm sản phẩm" data-testid="open-create-product" onClick={() => setShowProductModal(true)} className="shrink-0 whitespace-nowrap rounded-xl bg-emerald-700 px-3 py-2.5 text-xs font-black text-white shadow-sm hover:bg-emerald-800 sm:px-4 sm:py-3 sm:text-sm">+SP</button>}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {filteredItems.map(item => <article key={item.id} className={`overflow-hidden rounded-2xl border ${item.archived ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200'}`}>
            <div className="flex gap-3 p-4">
              {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-20 w-20 rounded-xl object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-emerald-50 text-3xl">📦</div>}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><h3 className="truncate font-black">{item.name}</h3>{item.archived && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-800">Ngừng nhập mới</span>}</div>
                <p className="text-xs text-slate-500">SKU {(item.skus?.length ? item.skus : [item.sku]).join(', ')} · PV {item.pv}{item.categoryName ? ` · ${item.categoryName}` : ''}</p>
                <p className={`mt-2 text-sm font-bold ${item.quantity <= item.lowStockThreshold ? 'text-amber-700' : 'text-emerald-700'}`}>
                  Tồn {item.quantity} · cảnh báo {item.lowStockThreshold}
                  {canManageCatalog && Number(item.otherUsersStock || 0) > 0 && <span className="ml-2 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">Kho khác: {item.otherUsersStock}</span>}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t p-3">
              {!item.archived && <button onClick={() => receiveStock(item)} className="flex-1 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">+ Nhập hàng</button>}
              <button onClick={() => adjustStock(item)} className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">Điều chỉnh</button>
              <button onClick={() => editThreshold(item)} data-testid={`threshold-btn-${item.sku}`} className="rounded-xl bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-800">Cảnh báo ({item.lowStockThreshold})</button>
              {canManageCatalog && <>
                <button onClick={() => editProduct(item)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">Sửa</button>
                <button onClick={() => archiveProduct(item)} className={`rounded-xl px-3 py-2 text-xs font-black ${item.archived ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{item.archived ? 'Mở bán lại' : 'Ngừng bán'}</button>
                <button onClick={() => deleteProduct(item)} className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-800">Xóa sản phẩm</button>
              </>}
            </div>
          </article>)}
        </div>
        {!filteredItems.length && <p className="py-10 text-center text-sm text-slate-500">Kho chưa có hàng.</p>}
        <div className="mt-6 border-t pt-5" data-testid="inventory-movements-log">
          <h3 className="font-black">Nhật ký nhập kho & xuất tồn</h3>
          <div className="mt-3 space-y-2">
            {movements.slice(0, 30).map(movement => {
              const typeLabels: Record<string, string> = { receive: 'Nhập kho', sale: 'Bán hàng', return: 'Hoàn hàng', adjustment: 'Điều chỉnh', cancel: 'Huỷ đơn' };
              const typeBadge = typeLabels[movement.type] || movement.type;
              const receivedDateStr = movement.receivedAt ? new Date(movement.receivedAt).toLocaleString('vi-VN') : null;
              return (
                <div key={movement._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs">
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-black ${movement.quantityDelta > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{typeBadge}</span>
                      <b className="text-slate-900">{movement.itemId?.name || 'Mặt hàng'}</b>
                      {movement.itemId?.sku && <span className="text-slate-500">({movement.itemId.sku})</span>}
                    </div>
                    <div className="text-slate-500">
                      {movement.reason || typeBadge}
                      {movement.unitCost > 0 && ` · Giá vốn: ${money(movement.unitCost)}`}
                      {receivedDateStr && ` · Ngày nhập: ${receivedDateStr}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={movement.quantityDelta > 0 ? 'text-sm font-black text-emerald-700' : 'text-sm font-black text-rose-700'}>
                      {movement.quantityDelta > 0 ? '+' : ''}{movement.quantityDelta} SP
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {new Date(movement.createdAt).toLocaleString('vi-VN')}
                    </div>
                  </div>
                </div>
              );
            })}
            {!movements.length && <p className="text-sm text-slate-500">Chưa có phát sinh kho.</p>}
          </div>
        </div>
      </div>
    </div>}

    {tab === 'prices' && (canPrices || canUseInventory) && <PriceListManager versions={priceVersions} products={canPrices ? priceProducts : items} canManage={canPrices} onSaved={loadPrices} onMessage={showMessage} />}

    {tab === 'sale' && canUseInventory && <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]"><div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6"><div className="flex flex-wrap justify-between gap-3"><h2 className="text-xl font-black">Tạo đơn hàng</h2><input type="datetime-local" value={soldAt} onChange={e => { setSoldAt(e.target.value); setSoldAtEdited(true); }} className="rounded-xl bg-slate-100 p-3 text-sm" /></div><fieldset className="space-y-2 rounded-2xl border border-slate-200 p-4"><legend className="px-2 text-sm font-black text-slate-800">Địa chỉ trên hóa đơn</legend><label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${invoiceAddressSelection === 'personal' ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'} ${!sellerProfile.address ? 'opacity-60' : ''}`}><input type="radio" name="invoiceSellerAddress" value="personal" checked={invoiceAddressSelection === 'personal'} disabled={!sellerProfile.address} onChange={() => setInvoiceAddressSelection('personal')} className="accent-emerald-700" /><span className="min-w-0 flex-1"><span className="mb-1 inline-flex rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-black text-white">CÁ NHÂN</span><span className="block break-words text-sm">{sellerProfile.address || 'Chưa có địa chỉ trong hồ sơ'}</span></span></label>{nutritionInvoiceAddresses.map(group => <label key={group.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${invoiceAddressSelection === group.id ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'}`}><input type="radio" name="invoiceSellerAddress" value={group.id} checked={invoiceAddressSelection === group.id} onChange={() => setInvoiceAddressSelection(group.id)} className="accent-emerald-700" /><span className="min-w-0 flex-1"><span className="mb-1 inline-flex rounded-full bg-emerald-700 px-2 py-0.5 text-[10px] font-black text-white">NDD · {group.name}</span><span className="block break-words text-sm">{group.address}</span></span></label>)}{!invoiceAddressesReady && <p className="text-xs text-slate-500">Đang tải địa chỉ NDD…</p>}</fieldset>{!hasSellerDetails && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{!sellerProfile.name || !sellerProfile.phone ? 'Cần cập nhật họ tên và số điện thoại trong hồ sơ người bán.' : !invoiceSellerAddress ? 'Cần cập nhật địa chỉ cá nhân trong hồ sơ hoặc chọn một địa chỉ NDD đang vận hành.' : 'Đang tải danh sách địa chỉ NDD.'} Thông tin người bán được lấy tự động từ hồ sơ hoặc NDD.</div>}<div className="flex flex-wrap gap-2">{(['member', 'custom'] as const).map(type => <button key={type} onClick={() => { setBuyerType(type); setSelectedMember(null); setBuyerAddress(''); setBuyerPhone(''); setCustomBuyer(''); }} className={`rounded-xl px-4 py-2 text-sm font-bold ${buyerType === type ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'}`}>{type === 'member' ? 'Hội viên' : 'Khách lẻ'}</button>)}</div>
      {buyerType === 'member' && <div className="relative"><input value={selectedMember ? getMemberIdentityLabel(selectedMember) : memberQuery} onChange={e => { setSelectedMember(null); setBuyerAddress(''); setBuyerPhone(''); setMemberQuery(e.target.value); }} placeholder="Tìm theo mã hoặc tên hội viên" className="w-full rounded-xl bg-slate-100 p-3" />{members.length > 0 && !selectedMember && <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border bg-white shadow-xl">{members.map(member => <button key={member.id} onClick={() => { setSelectedMember(member); setBuyerAddress(member.address || ''); setBuyerPhone(member.phoneNumber || ''); setMemberQuery(''); }} className="block w-full p-3 text-left text-sm hover:bg-emerald-50">{getMemberIdentityLabel(member)}</button>)}</div>}</div>}
      {buyerType === 'custom' && <input required value={customBuyer} onChange={e => setCustomBuyer(e.target.value)} placeholder="Tên khách lẻ" className="w-full rounded-xl bg-slate-100 p-3" />}
      <div className="grid gap-3 rounded-2xl bg-emerald-50/70 p-4 sm:grid-cols-2"><p className="text-xs text-emerald-900 sm:col-span-2">{buyerType === 'member' ? 'Thông tin được điền từ hồ sơ hội viên; người bán có thể bổ sung hoặc sửa nếu hồ sơ còn thiếu.' : 'Nhập thông tin liên hệ người mua để lưu trên hóa đơn.'}</p><label className="text-xs font-bold text-slate-600">Địa chỉ người mua<input required value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)} placeholder="Địa chỉ" className="mt-1 w-full rounded-xl bg-white p-3 text-sm font-normal" /></label><label className="text-xs font-bold text-slate-600">Số điện thoại người mua<input required type="tel" value={buyerPhone} onChange={e => setBuyerPhone(e.target.value)} placeholder="Số điện thoại" className="mt-1 w-full rounded-xl bg-white p-3 text-sm font-normal" /></label></div>
      <div className="flex gap-2"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm hàng trong kho" className="min-w-0 flex-1 rounded-xl bg-slate-100 p-3" /><button type="button" onClick={() => setShowSaleBarcodeScanner(true)} className="shrink-0 rounded-xl bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-800">📷 Quét mã</button></div><div className="grid gap-2 sm:grid-cols-2">{saleItems.map(item => <button key={item.id} onClick={() => addToCart(item)} disabled={item.quantity <= 0} className="flex items-center justify-between rounded-xl border p-3 text-left disabled:opacity-40"><span><b>{item.name}</b>{item.archived && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">Bán nốt tồn</span>}<small className="block text-slate-500">{(item.skus?.length ? item.skus : [item.sku]).join(', ')} · {item.quantity} tồn · {item.pv} PV</small></span><span className="rounded-lg bg-emerald-50 px-3 py-2 font-black text-emerald-800">+</span></button>)}</div></div>
      <aside className="h-fit space-y-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><h2 className="text-lg font-black">Giỏ hàng <span className="text-sm text-slate-400">({cart.length})</span></h2>{cart.map(line => <div key={line.itemId} className="rounded-xl bg-slate-50 p-3"><div className="flex justify-between gap-2 text-sm"><b>{line.name}</b><button onClick={() => setCart(old => old.filter(x => x.itemId !== line.itemId))} aria-label="Xoá hàng">×</button></div><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-xs text-slate-500">Số lượng<input type="number" min="1" max={line.available} value={line.quantity} onChange={e => updateCartLine(line.itemId, { quantity: Math.min(line.available, Number(e.target.value)) })} className="mt-1 w-full rounded-lg bg-white p-2 text-sm text-slate-900" /></label><label className="text-xs text-slate-500">Mức giá<select value={line.priceField} onChange={e => { const priceField = e.target.value; const tier = PRICE_TIERS.find(option => option.field === priceField) || PRICE_TIERS[0]; const entry = salePriceList?.entries?.find((price: any) => price.sku === (line.priceSku || line.sku)) || salePriceList?.entries?.find((price: any) => (line.skus || []).includes(price.sku)); updateCartLine(line.itemId, { priceField, priceLevel: tier.label, manualPriceLevel: true, unitPrice: Number(entry?.[priceField] || 0) }); }} className="mt-1 w-full rounded-lg bg-white p-2 text-sm text-slate-900">{PRICE_TIERS.map(tier => <option key={tier.field} value={tier.field}>{tier.label}</option>)}</select></label></div><p className="mt-2 text-[11px] text-slate-500">{line.priceLevel}: {money(line.unitPrice)}{line.manualPriceLevel && line.priceField !== line.defaultPriceField ? ` · Cấp bậc người mua: ${PRICE_TIERS.find(tier => tier.field === line.defaultPriceField)?.label || 'Giá Lẻ'}` : ''}</p></div>)}<textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Ghi chú trên hoá đơn (không bắt buộc)" className="min-h-20 w-full rounded-xl bg-slate-100 p-3 text-sm" /><div className="flex justify-between text-sm"><span>Tổng PV</span><b>{totalPv}</b></div><div className="flex justify-between border-t pt-3 text-lg"><b>Tổng tiền</b><b>{money(total)}</b></div><button disabled={busy || !hasSellerDetails || !cart.length || !buyerAddress.trim() || !buyerPhone.trim() || (buyerType === 'member' && !selectedMember) || (buyerType === 'custom' && !customBuyer.trim())} onClick={submitSale} className="w-full rounded-xl bg-emerald-700 py-3 font-black text-white disabled:opacity-40">{busy ? 'Đang lưu…' : 'Xác nhận bán hàng'}</button></aside>
    </div>}

    {tab === 'history' && canUseInventory && <div className="space-y-3"><div className="flex flex-wrap items-center gap-3"><input value={historyQuery} onChange={e => setHistoryQuery(e.target.value)} placeholder="Lọc theo mã hoá đơn, người mua, SKU hoặc mặt hàng" className="min-w-0 flex-1 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-emerald-500" />{canUseInventory && cancelledSalesCount > 0 && <button type="button" disabled={busy} onClick={deleteAllCancelledSales} className="shrink-0 rounded-2xl bg-rose-600 px-4 py-4 text-xs font-black text-white shadow-sm hover:bg-rose-700 disabled:opacity-50" data-testid="delete-all-cancelled-sales">🗑 Xóa tất cả đơn đã hủy ({cancelledSalesCount})</button>}</div>{filteredSales.map(sale => <article key={sale._id} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><b className="text-lg">{sale.invoiceNumber}</b><span className={`rounded-full px-3 py-1 text-xs font-bold ${sale.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : sale.status === 'cancelled' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{({ completed: 'Hoàn tất', partially_returned: 'Hoàn một phần', returned: 'Đã hoàn', cancelled: 'Đã huỷ' } as any)[sale.status]}</span></div><p className="mt-1 text-sm text-slate-500">{new Date(sale.soldAt).toLocaleString('vi-VN')} · {sale.buyerName} · {sale.totalPv} PV</p>{sale.status === 'cancelled' && sale.cancelReason && <p className="mt-1 text-xs text-rose-700">Lý do huỷ: {sale.cancelReason}</p>}</div><div className="flex flex-wrap gap-2"><button onClick={() => setInvoice(sale)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">Xem hoá đơn</button>{canUseInventory && !['cancelled', 'returned'].includes(sale.status) && <><button onClick={() => changeBuyer(sale)} className="rounded-xl bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-800">Sửa người mua</button><button onClick={() => handleReturn(sale)} className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Trả hàng</button>{sale.status === 'completed' && <button onClick={() => cancelSale(sale)} className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">Huỷ đơn</button>}</>}{canUseInventory && sale.status === 'cancelled' && <button type="button" disabled={busy} onClick={() => deleteCancelledSale(sale)} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50" data-testid={`delete-cancelled-sale-${sale._id}`}>Xóa hóa đơn</button>}</div></div><div className="mt-3 flex justify-between border-t pt-3 text-sm"><span>{sale.lines?.map((line: any) => `${line.name} × ${line.quantity}`).join(' · ')}</span><b>{money(sale.total)}</b></div>{sale.returnEvents?.map((event: any, i: number) => <p key={i} className="mt-2 text-xs text-amber-800">Đợt trả: {event.reason} · hoàn {money(event.refundAmount)}</p>)}</article>)}{!filteredSales.length && <p className="rounded-3xl bg-white p-10 text-center text-slate-500">Không có giao dịch phù hợp.</p>}</div>}

    {tab === 'reports' && canUseInventory && <InventoryReportPanel onOpenMemberPurchases={openMemberPurchases} onMessage={showMessage} />}

    {tab === 'levels' && canLevels && <div className="space-y-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><h2 className="text-xl font-black">Quản lý cấp độ tuyến dưới</h2><p className="text-sm text-slate-500">Bạn chỉ có thể cập nhật cấp độ thành viên nằm trong tuyến dưới của mình.</p>{downline.map(member => { const selected = levelEntries.find(entry => entry.id === member.id); return <div key={member.id} className="grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-[1fr_220px_1fr_auto] md:items-end"><div><b>{member.fullName}</b><div className="text-xs text-slate-500">{member.memberNumber || 'Chưa có mã'}</div></div><label className="text-xs font-bold text-slate-500">Cấp độ<select value={selected?.value || member.memberLevel} onChange={e => setLevelEntries(old => [...old.filter(x => x.id !== member.id), { id: member.id, value: e.target.value, reason: selected?.reason || '' }])} className="mt-1 w-full rounded-xl bg-white p-3 text-sm">{LEVELS.map(level => <option key={level.id} value={level.id}>{level.label}</option>)}</select></label><input value={selected?.reason || ''} onChange={e => setLevelEntries(old => [...old.filter(x => x.id !== member.id), { id: member.id, value: selected?.value || member.memberLevel, reason: e.target.value }])} placeholder="Lý do cập nhật" className="rounded-xl bg-white p-3 text-sm" /><button onClick={() => saveLevel(member)} className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white">Lưu</button></div>; })}{!downline.length && <p className="py-8 text-center text-sm text-slate-500">Chưa có thành viên trong tuyến dưới.</p>}</div>}

    {tab === 'settings' && canUseInventory && <div className="mx-auto max-w-2xl space-y-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><h2 className="text-xl font-black">Thông tin người bán trên hoá đơn</h2><div className="rounded-2xl bg-slate-50 p-4 text-sm"><p><b>Người bán:</b> {sellerProfile.name || 'Chưa cập nhật trong hồ sơ'}</p><p className="mt-2"><b>Địa chỉ:</b> {sellerProfile.address || 'Chưa cập nhật trong hồ sơ'}</p><p className="mt-2"><b>Số điện thoại:</b> {sellerProfile.phone || 'Chưa cập nhật trong hồ sơ'}</p><p className="mt-3 text-xs text-slate-500">Cập nhật thông tin người bán trong Hồ sơ cá nhân; thông tin không nhập riêng tại đây.</p></div><label className="block text-sm font-bold">Định dạng xuất mặc định<select value={sellerSettings.format} onChange={e => setSellerSettings({ ...sellerSettings, format: e.target.value })} className="mt-1 w-full rounded-xl bg-slate-100 p-3 font-normal"><option value="pdf">PDF / In</option><option value="image">Ảnh PNG</option></select></label><button onClick={saveSettings} className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white">Lưu định dạng</button></div>}

    {showProductModal && canManageCatalog && <ProductCreateModal draft={draft} setDraft={setDraft} draftPrices={draftPrices} setDraftPrices={setDraftPrices} categories={categories} priceTiers={PRICE_TIERS} canPrices={canPrices} pricesReady={pricesReady} busy={busy} onClose={() => setShowProductModal(false)} onSubmit={addProduct} onCreateCategory={() => { setCategoryTarget('create'); setShowCategoryModal(true); }} onScanBarcode={() => setShowBarcodeScanner(true)} onUploadImage={uploadImage} />}
    {showBatchReceiveModal && <BatchReceiveModal items={items} busy={busy} onClose={() => setShowBatchReceiveModal(false)} onSubmit={submitBatchReceive} />}
    {editingProduct && canManageCatalog && <ProductEditModal productName={editingProduct.name} draft={editDraft} setDraft={setEditDraft} prices={editPrices} setPrices={setEditPrices} categories={categories} priceTiers={PRICE_TIERS} canPrices={canPrices} busy={busy} onClose={() => setEditingProduct(null)} onSubmit={saveEditedProduct} onCreateCategory={() => { setCategoryTarget('edit'); setShowCategoryModal(true); }} onUploadImage={uploadEditImage} />}
    {stockAction && <StockActionModal action={stockAction.action} itemName={stockAction.item.name} archived={Boolean(stockAction.item.archived)} defaultUnitCost={Number(stockAction.item.prices?.costReference || stockAction.item.prices?.price50 || 0)} currentThreshold={Number(stockAction.item.lowStockThreshold ?? 5)} busy={busy} onClose={() => setStockAction(null)} onSubmit={submitStockAction} />}
    {showCategoryModal && canManageCatalog && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="create-category-title"><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 id="create-category-title" className="text-xl font-black">Tạo danh mục hàng hoá</h2><p className="mt-1 text-sm text-slate-500">Danh mục mẫu sản phẩm dùng chung.</p></div><button type="button" aria-label="Đóng tạo danh mục" onClick={() => setShowCategoryModal(false)} className="rounded-xl bg-slate-100 px-3 py-2">✕</button></div><label className="mt-5 block text-sm font-bold">Tên danh mục<input autoFocus maxLength={80} value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createCategory(); } }} className="mt-1 w-full rounded-xl bg-slate-100 p-3 font-normal" placeholder="Ví dụ: Dinh dưỡng, chăm sóc cá nhân" /></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setShowCategoryModal(false)} className="rounded-xl bg-slate-100 px-4 py-3 font-bold">Huỷ</button><button type="button" onClick={createCategory} disabled={!newCategoryName.trim()} className="rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white disabled:opacity-50">Tạo và chọn</button></div></div></div>}
    {showBarcodeScanner && <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setShowBarcodeScanner(false)} />}
    {showSaleBarcodeScanner && <BarcodeScanner onDetected={handleSaleBarcodeDetected} onClose={() => setShowSaleBarcodeScanner(false)} />}
    {invoice && <InvoicePreview sale={invoice} seller={{ name: invoice.sellerName || sellerProfile.name, address: invoice.sellerAddress || sellerProfile.address, phone: invoice.sellerPhone || sellerProfile.phone }} defaultFormat={sellerSettings?.format === 'image' ? 'image' : 'pdf'} onClose={() => setInvoice(null)} />}
  </section>;
});
InventoryDashboard.displayName = 'InventoryDashboard';
export default InventoryDashboard;
