import { test, expect } from '@playwright/test';

test('ứng dụng mở và bố cục không tràn ngang trên desktop/mobile', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('body')).toHaveText(/\S/);
  await page.waitForTimeout(1200);
  const dimensions = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 2);
});

test('giao diện quản lý bán hàng, mũi tên cuộn tab con, xóa đơn hủy và báo cáo trên desktop/mobile', async ({ page }) => {
  const mockUser = {
    id: 'u_test_1',
    _id: 'u_test_1',
    username: 'tester',
    fullName: 'Bùi Huy Hoàn',
    memberNumber: 'VA01562408',
    memberLevel: 'supervisor',
    phoneNumber: '0900000001',
    address: 'Hà Nội',
    status: 'ACTIVE',
    permissions: ['inventory:manage', 'inventory:sell', 'pricelist:manage', 'members:level:manage', 'admin:panel', 'users:view', 'users:update', 'users:delete'],
  };

  await page.addInitScript((user) => {
    window.localStorage.setItem('lucky_hub_user', JSON.stringify(user));
    window.localStorage.setItem('lucky_hub_remember', 'true');
    window.localStorage.setItem('lucky_hub_login_time', String(Date.now()));
  }, mockUser);

  await page.route('**/api/users/me', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) }));
  await page.route('**/api/users/u_test_1', async route => {
    if (route.request().method() === 'PUT') {
      const body = JSON.parse(route.request().postData() || '{}');
      Object.assign(mockUser, body);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) });
  });
  await page.route('**/api/session/ping', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
  await page.route('**/api/users', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([mockUser]) }));
  await page.route('**/api/knowledge', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route('**/api/rules', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route('**/api/chats', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route('**/api/metrics/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route('**/api/notifications/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route('**/api/goals/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reminders: [] }) }));
  await page.route('**/api/nutrition-groups', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route('**/api/inventory/items', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{
      _id: 'item1',
      id: 'item1',
      sku: 'F1',
      skus: ['F1'],
      name: 'Hỗn hợp dinh dưỡng F1',
      categoryName: 'Dinh dưỡng',
      pv: 23.95,
      quantity: 10,
      lowStockThreshold: 5,
      archived: false,
      hasActivePrice: true,
      prices: { sku: 'F1', costReference: 667000, price100: 1200000, price25: 950000, price35: 830000, price42: 750000, price50: 667000 },
      totalSystemStock: 10,
      otherUsersStock: 0,
    }]),
  }));
  await page.route('**/api/inventory/receive-batch', route => route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, receivedCount: 1, totalQuantity: 5, receivedAt: '2026-11-05T10:00:00.000Z', movements: [] }),
  }));
  await page.route('**/api/inventory/categories', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ _id: 'cat1', name: 'Dinh dưỡng' }]) }));
  await page.route('**/api/inventory/overview', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ itemCount: 1, totalUnits: 10, costValue: 6670000, estimated: { price100: 12000000, price25: 9500000, price35: 8300000, price42: 7500000, price50: 6670000 }, lowStock: [], monthly: [], recentSales: [] }),
  }));
  await page.route('**/api/inventory/movements', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{
      _id: 'mov_1',
      type: 'receive',
      quantityDelta: 5,
      unitCost: 667000,
      receivedAt: '2026-11-05T08:00:00.000Z',
      createdAt: '2026-11-05T08:01:00.000Z',
      reason: 'Nhập kho đợt 1',
      itemId: { _id: 'item1', sku: 'F1', name: 'Hỗn hợp dinh dưỡng F1' },
    }]),
  }));
  await page.route('**/api/inventory/print-preference', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ format: 'pdf' }) }));
  await page.route('**/api/inventory/price-list**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: null, versions: [] }) }));
  await page.route('**/api/inventory/sales**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      sales: [{
        _id: 'sale_cancelled_1',
        invoiceNumber: 'LK-05112026-1000-0001',
        soldAt: '2026-11-05T03:00:00.000Z',
        buyerName: 'Nguyễn Văn A',
        total: 1200000,
        totalPv: 23.95,
        status: 'cancelled',
        cancelReason: 'Nhập nhầm đơn',
        lines: [{ itemId: 'item1', sku: 'F1', name: 'Hỗn hợp dinh dưỡng F1', quantity: 1, unitPrice: 1200000 }],
      }],
      total: 1,
      page: 1,
      limit: 30,
    }),
  }));
  await page.route('**/api/inventory/reports/analytics**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      range: { from: '2026-02-01T00:00:00.000Z', to: '2027-01-31T23:59:59.999Z', periodType: 'herbalife_fy', granularity: 'month', herbalifeFiscalYear: 2026, label: 'Năm tài chính Herbalife 2026 (01/02/2026 - 31/01/2027)' },
      stockSummary: { totalItems: 1, totalAllItems: 1, totalUnits: 10, totalCostValue: 6670000, totalPv: 239.5, lowStockCount: 0, outOfStockCount: 0, archivedCount: 0, estimated: { price100: 12000000, price25: 9500000, price35: 8300000, price42: 7500000, price50: 6670000 } },
      stockItems: [{ id: 'item1', sku: 'F1', skus: ['F1'], name: 'Hỗn hợp dinh dưỡng F1', categoryName: 'Dinh dưỡng', imageUrl: '', pv: 23.95, quantity: 10, lowStockThreshold: 5, archived: false, costValue: 6670000, avgUnitCost: 667000, totalPv: 239.5, retailPrice: 1200000, retailValue: 12000000, stockStatus: 'in_stock' }],
      salesSummary: { orders: 2, units: 4, sales: 4800000, pv: 95.8, cost: 2668000, profit: 2132000 },
      trendSeries: [{ key: '2026-11', label: 'T11/26', fullLabel: 'Tháng 11/2026', sales: 4800000, pv: 95.8, orders: 2, units: 4, cost: 2668000, profit: 2132000 }],
      breakdown: {
        byProduct: [{ itemId: 'item1', sku: 'F1', name: 'Hỗn hợp dinh dưỡng F1', categoryName: 'Dinh dưỡng', units: 4, sales: 4800000, pv: 95.8, cost: 2668000, profit: 2132000, salesPercent: 100, unitsPercent: 100, pvPercent: 100 }],
        byCategory: [{ categoryName: 'Dinh dưỡng', units: 4, sales: 4800000, pv: 95.8, cost: 2668000, profit: 2132000, salesPercent: 100, unitsPercent: 100, pvPercent: 100 }],
      },
      topCustomers: {
        rangeLabel: 'Năm 2026',
        periodType: 'year',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-12-31T23:59:59.999Z',
        customers: [{ key: 'member:u1', buyerUserId: 'u1', buyerName: 'Trần Thị B', memberNumber: 'VA999888', buyerPhone: '0912345678', buyerType: 'member', orders: 2, units: 4, sales: 4800000, pv: 95.8, lastPurchaseAt: '2026-11-05T03:00:00.000Z' }],
      },
    }),
  }));
  await page.route('**/api/nutrition-groups/mine', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      group: { id: 'ndd1', name: 'NDD Hạnh Phúc', ownerName: 'Nguyễn Văn A' },
      pendingGroup: null,
    }),
  }));
  await page.route('**/api/admin/groups', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ _id: 'g1', id: 'g1', name: 'Admin', permissions: [], isDefault: false, members: ['u_test_1'] }]),
  }));
  await page.route('**/api/users/u_test_1/inventory-data', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      message: 'Đã xóa toàn bộ tồn kho và 1 hóa đơn của @tester.',
      deletedSalesCount: 1,
      deletedLotsCount: 1,
      deletedMovementsCount: 1,
      resetItemsCount: 1,
    }),
  }));

  await page.goto('/');
  const isMobile = (page.viewportSize()?.width || 1024) < 768;

  if (isMobile) {
    await page.getByRole('navigation', { name: 'Điều hướng nhanh' }).getByRole('button', { name: 'Khác' }).click();
    await expect(page.getByRole('menuitem', { name: 'Báo cáo bán hàng' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Quản lý bán hàng' }).click();
  } else {
    await expect(page.getByRole('button', { name: 'Báo cáo bán hàng' })).toBeVisible();
    await page.getByRole('button', { name: 'Quản lý hàng hoá' }).click();
  }

  await expect(page.getByTestId('inventory-dashboard')).toBeVisible();
  if (isMobile) {
    // Kiểm tra dòng chữ "KHO HÀNG CÁ NHÂN" nằm gọn trên 1 dòng trên di động
    const titleSpan = page.getByTestId('inventory-dashboard').locator('h1 span').first();
    const titleBox = await titleSpan.boundingBox();
    expect(titleBox).not.toBeNull();
    expect(titleBox!.height).toBeLessThanOrEqual(32);

    // Kiểm tra bottom menu di động chỉ hiển thị icon, không hiển thị text
    const mobileNavButtons = page.getByRole('navigation', { name: 'Điều hướng nhanh' }).locator('button');
    const btnCount = await mobileNavButtons.count();
    expect(btnCount).toBe(4);
    for (let i = 0; i < btnCount; i++) {
      const text = (await mobileNavButtons.nth(i).innerText()).trim();
      expect(text).toBe('');
    }
  }
  const nav = page.getByRole('navigation', { name: 'Quản lý bán hàng' });
  const container = nav.locator('..');
  const firstTabBtn = nav.getByRole('button', { name: /Tổng quan/ });
  await expect(firstTabBtn).toBeVisible();

  // Kiểm tra nút tab đầu tiên không bị che/cắt phần dưới khi vừa tải trang
  const [containerBox, firstBtnBox] = await Promise.all([container.boundingBox(), firstTabBtn.boundingBox()]);
  expect(containerBox).not.toBeNull();
  expect(firstBtnBox).not.toBeNull();
  expect(firstBtnBox!.height).toBeGreaterThanOrEqual(42);
  expect(firstBtnBox!.y).toBeGreaterThanOrEqual(containerBox!.y + 4);
  expect(firstBtnBox!.y + firstBtnBox!.height).toBeLessThanOrEqual(containerBox!.y + containerBox!.height - 4);

  if (isMobile) {
    // Kiểm tra nút mũi tên phải hiển thị sát mép, chiều ngang hẹp ~12px, chiều cao khớp khung chứa
    const rightArrow = page.getByTestId('subtabs-scroll-right');
    await expect(rightArrow).toBeVisible();
    await expect(page.getByTestId('subtabs-scroll-left')).toHaveCount(0);

    const arrowBox = await rightArrow.boundingBox();
    expect(arrowBox).not.toBeNull();
    expect(arrowBox!.width).toBeLessThanOrEqual(14);
    expect(Math.abs(arrowBox!.height - containerBox!.height)).toBeLessThanOrEqual(2);
    expect(Math.abs(arrowBox!.x + arrowBox!.width - (containerBox!.x + containerBox!.width))).toBeLessThanOrEqual(2);

    // Khi bấm kéo sang phải, nút mũi tên trái xuất hiện
    await rightArrow.click();
    await expect(page.getByTestId('subtabs-scroll-left')).toBeVisible();

    // Khi kéo hết về cuối bên phải, nút mũi tên phải tự ẩn
    await nav.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    await expect(page.getByTestId('subtabs-scroll-right')).toHaveCount(0);
  }

  // Kiểm tra tab Kho hàng: tạo mẫu sản phẩm không có input số lượng ban đầu, phiếu nhập hàng theo danh sách và nhật ký nhập kho
  await nav.getByRole('button', { name: /Kho hàng/ }).click();
  await expect(page.getByTestId('open-batch-receive')).toBeVisible();
  await expect(page.getByTestId('threshold-btn-F1')).toBeVisible();
  await expect(page.getByTestId('inventory-movements-log')).toContainText('Nhập kho');

  // Kiểm tra chữ "Kho của tôi" nằm trên dòng riêng phía trên, còn ô tìm kiếm + nút Thêm + nút +SP nằm cùng 1 dòng
  const myStockHeading = page.getByRole('heading', { name: 'Kho của tôi' });
  const searchInput = page.getByPlaceholder('Tìm SKU hoặc tên hàng');
  const receiveBtn = page.getByTestId('open-batch-receive');
  const createProdBtn = page.getByTestId('open-create-product');
  const [headingBox, searchBox, receiveBox, createBox] = await Promise.all([
    myStockHeading.boundingBox(),
    searchInput.boundingBox(),
    receiveBtn.boundingBox(),
    createProdBtn.boundingBox(),
  ]);
  expect(headingBox).not.toBeNull();
  expect(searchBox).not.toBeNull();
  expect(receiveBox).not.toBeNull();
  expect(createBox).not.toBeNull();
  expect(searchBox!.y).toBeGreaterThanOrEqual(headingBox!.y + headingBox!.height);
  expect(Math.abs(searchBox!.y - receiveBox!.y)).toBeLessThanOrEqual(4);
  expect(Math.abs(searchBox!.y - createBox!.y)).toBeLessThanOrEqual(4);

  // Mở modal tạo mẫu sản phẩm: xác nhận đã loại bỏ input số lượng ban đầu
  await page.getByTestId('open-create-product').click();
  await expect(page.getByRole('heading', { name: 'Thêm mẫu sản phẩm dùng chung' })).toBeVisible();
  await expect(page.getByText('Số lượng ban đầu')).toHaveCount(0);
  await page.getByRole('button', { name: 'Đóng thêm sản phẩm' }).click();

  // Kiểm tra modal Điều chỉnh tồn kho: nút − Giảm giúp nhập số âm dễ dàng trên iOS
  await page.getByRole('button', { name: 'Điều chỉnh' }).first().click();
  await expect(page.getByTestId('adjust-sign-negative')).toBeVisible();
  await page.getByTestId('adjust-sign-negative').click();
  await page.getByTestId('stock-adjust-delta-input').fill('5');
  await expect(page.getByTestId('stock-adjust-delta-input')).toHaveValue('-5');
  await page.getByRole('button', { name: 'Đóng thao tác kho' }).click();

  // Mở modal Nhập hàng vào kho cá nhân: kiểm tra ngày nhập không tràn container, quét mã hiện modal phụ, bấm +Thêm nhảy số màu đỏ đồng bộ 2 chiều
  await page.getByTestId('open-batch-receive').click();
  await expect(page.getByTestId('batch-receive-modal')).toBeVisible();

  const dateInput = page.getByTestId('batch-receive-date');
  await expect(dateInput).toBeVisible();
  const dateLabel = dateInput.locator('..');
  const [dateInputBox, dateLabelBox] = await Promise.all([dateInput.boundingBox(), dateLabel.boundingBox()]);
  expect(dateInputBox).not.toBeNull();
  expect(dateLabelBox).not.toBeNull();
  expect(dateInputBox!.x).toBeGreaterThanOrEqual(dateLabelBox!.x - 1);
  expect(dateInputBox!.x + dateInputBox!.width).toBeLessThanOrEqual(dateLabelBox!.x + dateLabelBox!.width + 1);

  // Quét mã sản phẩm -> mở modal phụ hiển thị ảnh/placeholder, mã SP, tên SP và ô nhập số lượng
  await page.getByTestId('batch-receive-scan-btn').click();
  await expect(page.getByRole('dialog', { name: 'Quét mã vạch sản phẩm' })).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('luckyhub:simulate-barcode', { detail: 'F1' }));
  });

  const scannedModal = page.getByTestId('batch-scanned-item-modal');
  await expect(scannedModal).toBeVisible();
  await expect(page.getByTestId('scanned-item-sku')).toContainText('F1');
  await expect(page.getByTestId('scanned-item-name')).toHaveText('Hỗn hợp dinh dưỡng F1');
  await page.getByTestId('scanned-item-qty-input').fill('3');
  await page.getByTestId('scanned-item-confirm-btn').click();
  await expect(scannedModal).toHaveCount(0);

  // Kiểm tra sau khi quét mã nhập 3: danh sách sản phẩm bên trái nhảy số (3) màu đỏ và danh sách nhập bên phải có SL = 3
  const addedCountBadge = page.getByTestId('batch-added-count-F1');
  await expect(addedCountBadge).toHaveText('3');
  const badgeColor = await addedCountBadge.evaluate(el => window.getComputedStyle(el).color);
  expect(badgeColor).toBe('rgb(255, 59, 48)');
  await expect(page.getByTestId('batch-qty-F1')).toHaveValue('3');

  // Bấm nút + Thêm trên danh sách sản phẩm: không mở modal phụ mà cộng trực tiếp lên 4
  await page.getByTestId('batch-add-item-F1').click();
  await expect(scannedModal).toHaveCount(0);
  await expect(addedCountBadge).toHaveText('4');
  await expect(page.getByTestId('batch-qty-F1')).toHaveValue('4');

  // Sửa lại số lượng ở danh sách nhập bên phải thành 5 -> số màu đỏ bên danh sách sản phẩm cũng nhảy thành 5
  await page.getByTestId('batch-qty-F1').fill('5');
  await expect(addedCountBadge).toHaveText('5');

  await page.getByTestId('submit-batch-receive').click();
  await expect(page.getByTestId('batch-receive-modal')).toHaveCount(0);

  // Kiểm tra tab Bán hàng: bật DEMO -> thêm hàng vào giỏ -> xem hóa đơn DEMO có tiêu đề "HOÁ ĐƠN TẠM TÍNH" căn giữa -> tắt DEMO phải tự xóa sạch giỏ hàng
  await nav.getByRole('button', { name: /Bán hàng/ }).click();
  const demoToggle = page.getByTestId('toggle-sale-demo-mode');
  await demoToggle.click();
  await expect(demoToggle).toHaveText('DEMO: Đang bật');
  await page.getByRole('button', { name: 'Khách lẻ' }).click();
  await page.getByPlaceholder('Tên khách lẻ').fill('Khách Demo');
  await page.getByPlaceholder('Địa chỉ').fill('Hà Nội');
  await page.getByPlaceholder('Số điện thoại').fill('0912345678');
  await page.getByRole('button', { name: /Hỗn hợp dinh dưỡng F1/ }).click();
  await expect(page.getByRole('heading', { name: /Giỏ hàng/ })).toContainText('(1)');
  await page.getByRole('button', { name: 'Xem trước / In tạm tính' }).click();
  const invoiceDialog = page.getByRole('dialog', { name: 'Xem trước hoá đơn' });
  await expect(invoiceDialog).toBeVisible();
  const invoiceHeading = invoiceDialog.locator('h1');
  await expect(invoiceHeading).toHaveText('HOÁ ĐƠN TẠM TÍNH');
  const headingAlign = await invoiceHeading.evaluate(el => window.getComputedStyle(el).textAlign);
  expect(headingAlign).toBe('center');
  await expect(invoiceDialog).not.toContainText('KHÔNG CÓ GIÁ TRỊ THẬT');
  // Khi chưa lưu STK & ngân hàng trong hồ sơ, nút gạt QR phải bị khóa
  await expect(page.getByTestId('invoice-qr-toggle')).toBeDisabled();
  await expect(page.getByTestId('invoice-qr-disabled-hint')).toBeVisible();
  await invoiceDialog.getByRole('button', { name: 'Đóng' }).click();
  await demoToggle.click();
  await expect(demoToggle).toHaveText('Bật chế độ DEMO');
  await expect(page.getByRole('heading', { name: /Giỏ hàng/ })).toContainText('(0)');

  // Kiểm tra xóa hóa đơn đã hủy trong tab Lịch sử
  await nav.getByRole('button', { name: /Lịch sử/ }).click();
  await expect(page.getByTestId('delete-all-cancelled-sales')).toBeVisible();
  await expect(page.getByTestId('delete-cancelled-sale-sale_cancelled_1')).toBeVisible();

  // Kiểm tra mở mục Báo cáo bán hàng từ menu di động hoặc tab
  if (isMobile) {
    await page.getByRole('navigation', { name: 'Điều hướng nhanh' }).getByRole('button', { name: 'Khác' }).click();
    await page.getByRole('menuitem', { name: 'Báo cáo bán hàng' }).click();
  } else {
    await nav.getByRole('button', { name: /Báo cáo/ }).click();
  }

  await expect(page.getByTestId('inventory-report-panel')).toBeVisible();
  await expect(page.getByTestId('sales-trend-bar-chart')).toBeVisible();
  await expect(page.getByTestId('sales-category-pie-chart')).toBeVisible();
  await expect(page.getByTestId('top-customers-section')).toBeVisible();
  await expect(page.getByTestId('stock-report-section')).toBeVisible();

  // Kiểm tra giao diện Hồ sơ cá nhân: avatar bên trái, ô thông tin bên phải
  if (isMobile) {
    await page.getByRole('navigation', { name: 'Điều hướng nhanh' }).getByRole('button', { name: 'Khác' }).click();
    await page.getByRole('menuitem', { name: 'Hồ sơ cá nhân' }).click();
  } else {
    await page.getByRole('button', { name: 'Menu tài khoản' }).click();
    await page.getByRole('menuitem', { name: 'Hồ sơ cá nhân' }).click();
  }
  const profileHeader = page.getByTestId('profile-header-card');
  const avatarEditor = page.getByTestId('profile-avatar-editor');
  const infoPanel = page.getByTestId('profile-info-panel');
  await expect(profileHeader).toBeVisible();
  await expect(avatarEditor).toBeVisible();
  await expect(infoPanel).toBeVisible();
  await expect(infoPanel).toContainText('Bùi Huy Hoàn');
  await expect(infoPanel).toContainText('@tester');
  await expect(infoPanel).toContainText('Nhóm:');
  await expect(infoPanel).toContainText('Cấp độ:');
  await expect(infoPanel).toContainText('Thành tựu:');

  const [headerRect, avatarRect, infoRect] = await Promise.all([
    profileHeader.boundingBox(),
    avatarEditor.boundingBox(),
    infoPanel.boundingBox(),
  ]);
  expect(headerRect).not.toBeNull();
  expect(avatarRect).not.toBeNull();
  expect(infoRect).not.toBeNull();
  expect(avatarRect!.x).toBeLessThan(infoRect!.x);
  expect(avatarRect!.y + avatarRect!.height).toBeLessThanOrEqual(headerRect!.y + headerRect!.height + 2);

  // Kiểm tra 2 trường Ngân hàng / Ví điện tử và Số tài khoản hiển thị cho hội viên có quyền bán hàng
  const bankSelect = page.getByTestId('profile-bank-name');
  const bankAccountInput = page.getByTestId('profile-bank-account');
  await expect(bankSelect).toBeVisible();
  await expect(bankAccountInput).toBeVisible();

  // Mở danh sách xổ xuống: dòng đầu tiên phải là ô nhập text tìm kiếm, có Vietcombank/MoMo/VNPay và không có ShopeePay
  await bankSelect.click();
  const bankDropdown = page.getByTestId('profile-bank-dropdown');
  const bankSearchInput = page.getByTestId('profile-bank-search');
  await expect(bankDropdown).toBeVisible();
  await expect(bankSearchInput).toBeVisible();
  await expect(page.getByTestId('profile-bank-option-VCB')).toBeVisible();
  await expect(page.getByTestId('profile-bank-option-MOMO')).toBeVisible();
  await expect(page.getByTestId('profile-bank-option-VNPAY')).toBeVisible();
  await expect(page.getByTestId('profile-bank-option-SHOPEEPAY')).toHaveCount(0);

  // Gõ tìm kiếm ở dòng đầu tiên và chọn Vietcombank
  await bankSearchInput.fill('Vietcombank');
  await expect(page.getByTestId('profile-bank-option-VCB')).toBeVisible();
  await expect(page.getByTestId('profile-bank-option-MOMO')).toHaveCount(0);
  await page.getByTestId('profile-bank-option-VCB').click();
  await expect(bankDropdown).toHaveCount(0);

  await bankAccountInput.fill('0123456789');
  await page.getByRole('button', { name: 'Cập nhật hồ sơ hội viên' }).click();

  // Quay lại Quản lý bán hàng -> Lịch sử -> Xem hoá đơn để bật nút gạt tạo mã QR chuyển khoản
  if (isMobile) {
    await page.getByRole('navigation', { name: 'Điều hướng nhanh' }).getByRole('button', { name: 'Khác' }).click();
    await page.getByRole('menuitem', { name: 'Quản lý bán hàng' }).click();
  } else {
    await page.getByRole('button', { name: 'Quản lý hàng hoá' }).click();
  }
  await page.getByRole('navigation', { name: 'Quản lý bán hàng' }).getByRole('button', { name: /Lịch sử/ }).click();
  await page.getByRole('button', { name: 'Xem hoá đơn' }).first().click();

  const qrToggle = page.getByTestId('invoice-qr-toggle');
  await expect(qrToggle).toBeEnabled();
  await qrToggle.click();
  await expect(qrToggle).toHaveAttribute('aria-checked', 'true');

  const qrBox = page.getByTestId('invoice-qr-box');
  const buyerInfo = page.getByTestId('invoice-buyer-info');
  await expect(qrBox).toBeVisible();
  await expect(page.getByTestId('invoice-qr-image')).toBeVisible();
  await expect(page.getByTestId('invoice-qr-caption')).toHaveText('Quét mã để thanh toán nhanh');
  await expect(qrBox).toContainText('Vietcombank · 0123456789');
  await expect(qrBox).toContainText('Bùi Huy Hoàn');
  await expect(qrBox).toContainText(/1[\s.]200[\s.]000/);

  if (!isMobile) {
    const [buyerBox, qrRect] = await Promise.all([buyerInfo.boundingBox(), qrBox.boundingBox()]);
    expect(buyerBox).not.toBeNull();
    expect(qrRect).not.toBeNull();
    expect(qrRect!.x).toBeGreaterThanOrEqual(buyerBox!.x + buyerBox!.width - 4);
  }
  await page.getByRole('dialog', { name: 'Xem trước hoá đơn' }).getByRole('button', { name: 'Đóng' }).click();

  // Kiểm tra chức năng Admin xóa toàn bộ dữ liệu tồn kho & hóa đơn của một user
  if (isMobile) {
    await page.getByRole('navigation', { name: 'Điều hướng nhanh' }).getByRole('button', { name: 'Khác' }).click();
    await page.getByRole('menuitem', { name: 'Quản trị' }).click();
    await page.getByTestId('reset-inventory-mobile-u_test_1').click();
  } else {
    await page.getByRole('button', { name: 'Quản trị' }).click();
    await page.getByTestId('reset-inventory-desktop-u_test_1').click();
  }
  await expect(page.getByTestId('reset-user-inventory-modal')).toBeVisible();
  await expect(page.getByTestId('reset-user-inventory-phrase')).toHaveText('XÁC NHẬN XÓA DỮ LIỆU tester');
  const confirmBtn = page.getByTestId('confirm-reset-user-inventory');
  const resetInput = page.getByTestId('reset-user-inventory-input');
  await expect(confirmBtn).toBeDisabled();

  // Kiểm tra chặn dán (paste) vào ô xác nhận
  await resetInput.dispatchEvent('paste');
  await expect(page.getByTestId('reset-user-inventory-paste-warning')).toBeVisible();

  // Nhập chính xác chuỗi xác nhận (kể cả gõ kiểu XOÁ dấu trên A trên iOS/macOS) và bấm nút Xác nhận xóa dữ liệu
  await resetInput.fill('XÁC NHẬN XOÁ DỮ LIỆU tester');
  await expect(confirmBtn).toBeEnabled();
  await confirmBtn.click();
  await expect(page.getByTestId('reset-user-inventory-modal')).toHaveCount(0);
});

test('ẩn thông tin ngân hàng thụ hưởng trong hồ sơ khi hội viên không còn quyền bán hàng', async ({ page }) => {
  const userWithoutSellPerm = {
    id: 'u_no_sell',
    _id: 'u_no_sell',
    username: 'member_nosell',
    fullName: 'Lê Văn C',
    email: 'nosell@example.com',
    phoneNumber: '0900000009',
    address: 'Đà Nẵng',
    bankName: 'VCB',
    bankAccountNumber: '999988887777',
    status: 'ACTIVE',
    permissions: ['metrics:view:own'],
    groupPermissions: ['metrics:view:own'],
  };

  await page.addInitScript((user) => {
    window.localStorage.setItem('lucky_hub_user', JSON.stringify(user));
    window.localStorage.setItem('lucky_hub_remember', 'true');
    window.localStorage.setItem('lucky_hub_login_time', String(Date.now()));
  }, userWithoutSellPerm);

  await page.route('**/api/users/me', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(userWithoutSellPerm) }));
  await page.route('**/api/session/ping', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
  await page.route('**/api/users', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([userWithoutSellPerm]) }));
  await page.route('**/api/knowledge', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route('**/api/rules', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route('**/api/chats', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route('**/api/metrics/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route('**/api/notifications/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route('**/api/goals/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reminders: [] }) }));
  await page.route('**/api/nutrition-groups/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ group: null, pendingGroup: null }) }));

  await page.goto('/');
  const isMobile = (page.viewportSize()?.width || 1024) < 768;
  if (isMobile) {
    await page.getByRole('navigation', { name: 'Điều hướng nhanh' }).getByRole('button', { name: 'Khác' }).click();
    await page.getByRole('menuitem', { name: 'Hồ sơ cá nhân' }).click();
  } else {
    await page.getByRole('button', { name: 'Menu tài khoản' }).click();
    await page.getByRole('menuitem', { name: 'Hồ sơ cá nhân' }).click();
  }

  await expect(page.getByTestId('profile-header-card')).toBeVisible();
  await expect(page.getByTestId('profile-bank-name')).toHaveCount(0);
  await expect(page.getByTestId('profile-bank-account')).toHaveCount(0);
});

test.describe('luồng quản lý kho cần tài khoản E2E riêng', () => {
  test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD, 'Cấu hình E2E_EMAIL/E2E_PASSWORD của tài khoản có inventory:manage để chạy luồng đã đăng nhập.');

  const signIn = async (page: any) => {
    await page.goto('/');
    await page.getByPlaceholder('Email hoặc Tên đăng nhập').fill(process.env.E2E_EMAIL!);
    await page.getByPlaceholder('Mật khẩu').fill(process.env.E2E_PASSWORD!);
    await page.getByRole('button', { name: 'ĐĂNG NHẬP NGAY' }).click();
  };

  test('người có quyền mở và tạo bảng giá trên desktop/mobile', async ({ page }) => {
    await signIn(page);
    if ((page.viewportSize()?.width || 1024) < 768) {
      await page.getByRole('navigation', { name: 'Điều hướng nhanh' }).getByRole('button', { name: 'Khác' }).click();
      await page.getByRole('menuitem', { name: 'Quản lý bảng giá' }).click();
    } else {
      await expect(page.getByRole('button', { name: 'Bảng giá chung' })).toBeVisible({ timeout: 20_000 });
      await page.getByRole('button', { name: 'Bảng giá chung' }).click();
    }
    await expect(page.getByTestId('inventory-dashboard')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Danh sách bảng giá' })).toBeVisible();
    await page.getByRole('button', { name: '+ Tạo mới bảng giá' }).click();
    await expect(page.getByRole('heading', { name: 'Tạo bảng giá mới' })).toBeVisible();
    await expect(page.getByLabel('Tên bảng giá')).toBeVisible();
    await expect(page.getByLabel('Ngày bắt đầu hiệu lực')).toBeVisible();
    await expect(page.getByLabel(/Ngày kết thúc hiệu lực/)).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Ảnh' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'SKU / PV' })).toBeVisible();
    for (const label of ['Giá 100%', 'Giá giảm 25%', 'Giá giảm 35%', 'Giá giảm 42%', 'Giá giảm 50%']) {
      await expect(page.getByRole('columnheader', { name: label })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Đóng' }).click();
    const firstVersion = page.locator('details').first();
    await firstVersion.locator('summary').click();
    await expect(firstVersion.getByRole('button', { name: 'Sửa' })).toBeVisible();
    await expect(firstVersion.getByRole('button', { name: 'Xóa' })).toBeVisible();
    await expect(firstVersion.getByRole('button', { name: 'In / Lưu PDF' })).toBeVisible();
    await expect(firstVersion.getByRole('button', { name: 'Lưu ảnh' })).toBeVisible();
    if ((page.viewportSize()?.width || 1024) >= 768) {
      const [pdfWindow] = await Promise.all([page.waitForEvent('popup'), firstVersion.getByRole('button', { name: 'In / Lưu PDF' }).click()]);
      await expect(pdfWindow.locator('h1')).toBeVisible();
      await pdfWindow.close();
      const [imageDownload] = await Promise.all([page.waitForEvent('download'), firstVersion.getByRole('button', { name: 'Lưu ảnh' }).click()]);
      expect(imageDownload.suggestedFilename()).toMatch(/\.png$/);
    }
    await firstVersion.getByRole('button', { name: 'Sửa' }).click();
    await expect(page.getByRole('heading', { name: 'Sửa bảng giá' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lưu thay đổi' })).toBeVisible();
    await page.getByRole('button', { name: 'Đóng' }).click();
    await page.getByRole('navigation', { name: 'Quản lý bán hàng' }).getByRole('button', { name: /Kho hàng/ }).click();
    await page.getByTestId('open-create-product').click();
    await expect(page.getByPlaceholder('SKU1, SKU2, SKU3')).toBeVisible();
    await page.getByRole('button', { name: 'Đóng thêm sản phẩm' }).click();
    await page.getByRole('navigation', { name: 'Quản lý bán hàng' }).getByRole('button', { name: 'Bán hàng' }).click();
    await expect(page.getByRole('button', { name: /Quét mã/ })).toBeVisible();
  });

  test('tạo mặt hàng, đặt bảng giá chung, bán hàng và mở hoá đơn', async ({ page }) => {
    test.skip(process.env.E2E_RUN_MUTATING !== '1', 'Bật E2E_RUN_MUTATING=1 với tài khoản kiểm thử có inventory:manage và pricelist:manage.');
    await signIn(page);
    await page.getByRole('button', { name: 'Quản lý hàng hoá' }).click();
    await page.getByRole('button', { name: 'Kho hàng' }).click();
    await page.getByRole('button', { name: 'Thêm sản phẩm' }).click();
    const sku = `PW${Date.now()}`;
    await page.getByTestId('create-item-sku').fill(sku);
    await page.getByTestId('create-item-name').fill(`Playwright ${sku}`);
    await page.getByPlaceholder('Điểm PV').fill('2.5');
    await page.getByPlaceholder('SL ban đầu').fill('2');
    await page.getByPlaceholder('Giá vốn').fill('100');
    await page.getByRole('button', { name: 'Thêm vào kho' }).click();
    await expect(page.getByText(`SKU ${sku}`)).toBeVisible();
    await page.getByRole('button', { name: 'Bảng giá' }).click();
    await page.getByTestId(`price-${sku}-costReference`).fill('100');
    for (const field of ['price100', 'price25', 'price35', 'price42', 'price50']) await page.getByTestId(`price-${sku}-${field}`).fill('250');
    await page.getByRole('button', { name: 'Lưu phiên bản' }).click();
    await page.getByRole('button', { name: 'Bán hàng' }).first().click();
    await page.getByRole('button', { name: new RegExp(`Playwright ${sku}`) }).click();
    await page.getByRole('button', { name: 'Xác nhận bán hàng' }).click();
    await expect(page.getByRole('dialog', { name: 'Xem trước hoá đơn' })).toBeVisible();
    await expect(page.getByText(/LK-\d{8}-\d{4}-\d{4}/)).toBeVisible();
  });
});
