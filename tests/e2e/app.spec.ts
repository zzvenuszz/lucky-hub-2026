import { test, expect } from '@playwright/test';

test('ứng dụng mở và bố cục không tràn ngang trên desktop/mobile', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('body')).toHaveText(/\S/);
  await page.waitForTimeout(1200);
  const dimensions = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 2);
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
