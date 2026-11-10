import { QRCodeDecoderErrorCorrectionLevel, QRCodeEncoder } from '@zxing/library';

export interface VietQrProviderOption {
  code: string;
  shortName: string;
  name: string;
  bin: string;
  group: 'bank' | 'wallet';
}

export const VIETQR_PROVIDERS: VietQrProviderOption[] = [
  // Ngân hàng tại Việt Nam (Napas247 / VietQR)
  { code: 'VCB', shortName: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại thương Việt Nam (Vietcombank)', bin: '970436', group: 'bank' },
  { code: 'CTG', shortName: 'VietinBank', name: 'Ngân hàng TMCP Công thương Việt Nam (VietinBank)', bin: '970415', group: 'bank' },
  { code: 'BIDV', shortName: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV)', bin: '970418', group: 'bank' },
  { code: 'VBA', shortName: 'Agribank', name: 'Ngân hàng Nông nghiệp và PTNT Việt Nam (Agribank)', bin: '970405', group: 'bank' },
  { code: 'TCB', shortName: 'Techcombank', name: 'Ngân hàng TMCP Kỹ thương Việt Nam (Techcombank)', bin: '970407', group: 'bank' },
  { code: 'MB', shortName: 'MB Bank', name: 'Ngân hàng TMCP Quân đội (MB Bank)', bin: '970422', group: 'bank' },
  { code: 'ACB', shortName: 'ACB', name: 'Ngân hàng TMCP Á Châu (ACB)', bin: '970416', group: 'bank' },
  { code: 'VPB', shortName: 'VPBank', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng (VPBank)', bin: '970432', group: 'bank' },
  { code: 'TPB', shortName: 'TPBank', name: 'Ngân hàng TMCP Tiên Phong (TPBank)', bin: '970423', group: 'bank' },
  { code: 'STB', shortName: 'Sacombank', name: 'Ngân hàng TMCP Sài Gòn Thương Tín (Sacombank)', bin: '970403', group: 'bank' },
  { code: 'VIB', shortName: 'VIB', name: 'Ngân hàng TMCP Quốc tế Việt Nam (VIB)', bin: '970441', group: 'bank' },
  { code: 'HDB', shortName: 'HDBank', name: 'Ngân hàng TMCP Phát triển TP.HCM (HDBank)', bin: '970437', group: 'bank' },
  { code: 'SHB', shortName: 'SHB', name: 'Ngân hàng TMCP Sài Gòn - Hà Nội (SHB)', bin: '970443', group: 'bank' },
  { code: 'SEAB', shortName: 'SeABank', name: 'Ngân hàng TMCP Đông Nam Á (SeABank)', bin: '970440', group: 'bank' },
  { code: 'MSB', shortName: 'MSB', name: 'Ngân hàng TMCP Hàng Hải Việt Nam (MSB)', bin: '970426', group: 'bank' },
  { code: 'OCB', shortName: 'OCB', name: 'Ngân hàng TMCP Phương Đông (OCB)', bin: '970448', group: 'bank' },
  { code: 'LPB', shortName: 'LPBank', name: 'Ngân hàng TMCP Lộc Phát Việt Nam (LPBank)', bin: '970449', group: 'bank' },
  { code: 'EIB', shortName: 'Eximbank', name: 'Ngân hàng TMCP Xuất Nhập khẩu Việt Nam (Eximbank)', bin: '970431', group: 'bank' },
  { code: 'SCB', shortName: 'SCB', name: 'Ngân hàng TMCP Sài Gòn (SCB)', bin: '970429', group: 'bank' },
  { code: 'ABB', shortName: 'ABBank', name: 'Ngân hàng TMCP An Bình (ABBank)', bin: '970425', group: 'bank' },
  { code: 'BAB', shortName: 'Bac A Bank', name: 'Ngân hàng TMCP Bắc Á (Bac A Bank)', bin: '970409', group: 'bank' },
  { code: 'NAB', shortName: 'Nam A Bank', name: 'Ngân hàng TMCP Nam Á (Nam A Bank)', bin: '970428', group: 'bank' },
  { code: 'PVCB', shortName: 'PVcomBank', name: 'Ngân hàng TMCP Đại Chúng Việt Nam (PVcomBank)', bin: '970412', group: 'bank' },
  { code: 'VB', shortName: 'VietBank', name: 'Ngân hàng TMCP Việt Nam Thương Tín (VietBank)', bin: '970433', group: 'bank' },
  { code: 'BVB', shortName: 'BVBank (Bản Việt)', name: 'Ngân hàng TMCP Bản Việt (BVBank)', bin: '970454', group: 'bank' },
  { code: 'KLB', shortName: 'KienlongBank', name: 'Ngân hàng TMCP Kiên Long (KienlongBank)', bin: '970452', group: 'bank' },
  { code: 'NCB', shortName: 'NCB', name: 'Ngân hàng TMCP Quốc Dân (NCB)', bin: '970419', group: 'bank' },
  { code: 'PGB', shortName: 'PGBank', name: 'Ngân hàng TMCP Thịnh vượng và Phát triển (PGBank)', bin: '970430', group: 'bank' },
  { code: 'VAB', shortName: 'VietABank', name: 'Ngân hàng TMCP Việt Á (VietABank)', bin: '970427', group: 'bank' },
  { code: 'BAOVIET', shortName: 'BaoVietBank', name: 'Ngân hàng TMCP Bảo Việt (BaoVietBank)', bin: '970438', group: 'bank' },
  { code: 'SGB', shortName: 'Saigonbank', name: 'Ngân hàng TMCP Sài Gòn Công Thương (Saigonbank)', bin: '970400', group: 'bank' },
  { code: 'DOB', shortName: 'DongA Bank / Vikki', name: 'Ngân hàng TMCP Đông Á (DongA Bank / Vikki)', bin: '970406', group: 'bank' },
  { code: 'MBV', shortName: 'OceanBank (MBV)', name: 'Ngân hàng TNHH MTV Việt Nam Hiện Đại (OceanBank / MBV)', bin: '970414', group: 'bank' },
  { code: 'GPB', shortName: 'GPBank', name: 'Ngân hàng Thương mại TNHH MTV Dầu Khí Toàn Cầu (GPBank)', bin: '970408', group: 'bank' },
  { code: 'CBB', shortName: 'CBBank', name: 'Ngân hàng Thương mại TNHH MTV Xây dựng Việt Nam (CBBank)', bin: '970444', group: 'bank' },
  { code: 'IVB', shortName: 'Indovina Bank', name: 'Ngân hàng TNHH Indovina (IVB)', bin: '970434', group: 'bank' },
  { code: 'VRB', shortName: 'VRB', name: 'Ngân hàng Liên doanh Việt - Nga (VRB)', bin: '970421', group: 'bank' },
  { code: 'WVN', shortName: 'Woori Bank', name: 'Ngân hàng TNHH MTV Woori Việt Nam (Woori Bank)', bin: '970457', group: 'bank' },
  { code: 'SHBVN', shortName: 'Shinhan Bank', name: 'Ngân hàng TNHH MTV Shinhan Việt Nam (Shinhan Bank)', bin: '970424', group: 'bank' },
  { code: 'PBVN', shortName: 'Public Bank', name: 'Ngân hàng TNHH MTV Public Việt Nam (Public Bank)', bin: '970439', group: 'bank' },
  { code: 'UOB', shortName: 'UOB', name: 'Ngân hàng TNHH MTV United Overseas Bank (UOB)', bin: '970458', group: 'bank' },
  { code: 'SCVN', shortName: 'Standard Chartered', name: 'Ngân hàng TNHH MTV Standard Chartered Việt Nam', bin: '970410', group: 'bank' },
  { code: 'HSBC', shortName: 'HSBC', name: 'Ngân hàng TNHH MTV HSBC Việt Nam', bin: '458761', group: 'bank' },
  { code: 'HLBVN', shortName: 'Hong Leong Bank', name: 'Ngân hàng TNHH MTV Hong Leong Việt Nam', bin: '970442', group: 'bank' },
  { code: 'CIMB', shortName: 'CIMB', name: 'Ngân hàng TNHH MTV CIMB Việt Nam', bin: '422589', group: 'bank' },
  { code: 'CAKE', shortName: 'Cake by VPBank', name: 'Ngân hàng số Cake by VPBank', bin: '546034', group: 'bank' },
  { code: 'UBANK', shortName: 'Ubank by VPBank', name: 'Ngân hàng số Ubank by VPBank', bin: '546035', group: 'bank' },
  { code: 'TIMO', shortName: 'Timo by BVBank', name: 'Ngân hàng số Timo by BVBank', bin: '963388', group: 'bank' },

  // Ví điện tử & Trung gian thanh toán tại Việt Nam
  { code: 'MOMO', shortName: 'Ví MoMo', name: 'Ví điện tử MoMo (Napas247 / VietQR)', bin: '971025', group: 'wallet' },
  { code: 'VNPAY', shortName: 'Ví VNPay', name: 'Ví điện tử VNPay', bin: '971011', group: 'wallet' },
  { code: 'ZALOPAY', shortName: 'Ví ZaloPay', name: 'Ví điện tử ZaloPay', bin: '971016', group: 'wallet' },
  { code: 'VIETTELMONEY', shortName: 'Viettel Money', name: 'Hệ sinh thái tài chính số Viettel Money', bin: '971005', group: 'wallet' },
  { code: 'VNPTMONEY', shortName: 'VNPT Money', name: 'Ví điện tử VNPT Money', bin: '971012', group: 'wallet' },
];

export const findVietQrProvider = (bankKey?: string | null): VietQrProviderOption | null => {
  const normalized = String(bankKey || '').trim().toUpperCase();
  if (!normalized) return null;
  return (
    VIETQR_PROVIDERS.find(p => p.code.toUpperCase() === normalized) ||
    VIETQR_PROVIDERS.find(p => p.shortName.toUpperCase() === normalized) ||
    VIETQR_PROVIDERS.find(p => p.bin === normalized) ||
    VIETQR_PROVIDERS.find(p => p.name.toUpperCase() === normalized) ||
    null
  );
};

const toTlv = (id: string, value: string): string => {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
};

export const stripVietnameseAccents = (input: string): string =>
  String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9 .,-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const computeCrc16Ccitt = (payload: string): string => {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= (payload.charCodeAt(i) & 0xff) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
};

export interface BuildVietQrParams {
  bankKey: string;
  accountNumber: string;
  accountName?: string;
  amount?: number;
  description?: string;
}

/**
 * Tạo chuỗi EMVCo Napas247 (VietQR) chuẩn quốc gia, hỗ trợ quét từ MoMo, VNPay
 * và tất cả ứng dụng ngân hàng tại Việt Nam.
 */
export const buildVietQrPayload = ({
  bankKey,
  accountNumber,
  accountName = '',
  amount = 0,
  description = '',
}: BuildVietQrParams): string => {
  const provider = findVietQrProvider(bankKey);
  const bin = provider?.bin || '970436';
  const cleanAccount = String(accountNumber || '').replace(/\s+/g, '').trim();
  const safeAmount = Math.max(0, Math.round(Number(amount) || 0));
  const cleanName = stripVietnameseAccents(accountName).toUpperCase().slice(0, 25);
  const cleanDesc = stripVietnameseAccents(description).slice(0, 50);

  // Field 38: Merchant Account Information (Napas247 AID A000000727)
  const beneficiaryOrg = toTlv('00', bin) + toTlv('01', cleanAccount);
  const merchantAccountInfo =
    toTlv('00', 'A000000727') +
    toTlv('01', beneficiaryOrg) +
    toTlv('02', 'QRIBFTTA');

  let body = '';
  body += toTlv('00', '01'); // Payload Format Indicator
  body += toTlv('01', safeAmount > 0 ? '12' : '11'); // 12 = Dynamic QR (có số tiền), 11 = Static QR
  body += toTlv('38', merchantAccountInfo);
  body += toTlv('53', '704'); // VND
  if (safeAmount > 0) {
    body += toTlv('54', String(safeAmount));
  }
  body += toTlv('58', 'VN');
  if (cleanName) {
    body += toTlv('59', cleanName);
  }
  if (cleanDesc) {
    body += toTlv('62', toTlv('08', cleanDesc));
  }

  const withCrcTag = `${body}6304`;
  const crc = computeCrc16Ccitt(withCrcTag);
  return `${withCrcTag}${crc}`;
};

/**
 * Vẽ mã QR từ chuỗi EMVCo VietQR lên vùng (x, y, size, size) của Canvas 2D context.
 */
export const drawQrMatrixToContext = (
  ctx: CanvasRenderingContext2D,
  payload: string,
  x: number,
  y: number,
  size: number,
  quietZoneModules: number = 3
): boolean => {
  try {
    const qr = QRCodeEncoder.encode(payload, QRCodeDecoderErrorCorrectionLevel.M);
    const matrix = qr.getMatrix();
    if (!matrix) return false;
    const width = matrix.getWidth();
    const height = matrix.getHeight();
    const totalModules = width + quietZoneModules * 2;
    const moduleSize = size / totalModules;

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#0f172a';
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        if (matrix.get(col, row) === 1) {
          const px = x + (col + quietZoneModules) * moduleSize;
          const py = y + (row + quietZoneModules) * moduleSize;
          ctx.fillRect(Math.floor(px), Math.floor(py), Math.ceil(moduleSize), Math.ceil(moduleSize));
        }
      }
    }
    ctx.restore();
    return true;
  } catch (error) {
    console.error('[VietQR] Failed to encode QR matrix:', error);
    return false;
  }
};

/**
 * Tạo ảnh Data URL (PNG) của mã VietQR để hiển thị trên Web và cửa sổ In HTML.
 */
export const generateVietQrDataUrl = (params: BuildVietQrParams, size: number = 280): string => {
  try {
    const payload = buildVietQrPayload(params);
    if (typeof document === 'undefined') return '';
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    const ok = drawQrMatrixToContext(ctx, payload, 0, 0, size, 3);
    if (!ok) return '';
    console.log('[VietQR] Generated QR image successfully:', {
      bankKey: params.bankKey,
      amount: params.amount,
      payloadLength: payload.length,
    });
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('[VietQR] Error generating QR Data URL:', error);
    return '';
  }
};
