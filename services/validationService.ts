/**
 * Validation Service - Middleware xác thực dữ liệu đầu vào cho API endpoints
 * Kiểm tra format, độ dài, XSS sanitize,...
 */

// XSS Sanitize - Loại bỏ các thẻ script, event handlers khỏi text
export function sanitizeText(input: string): string {
  if (!input) return '';
  let result = input;
  
  // Loại bỏ thẻ script và các biến thể (bao gồm cả base64 encoded)
  result = result.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  result = result.replace(/<script\b[^>]*\/>/gi, '');
  result = result.replace(/<script[\s\S]*?<\/script\s*>/gi, '');
  
  // Loại bỏ event handlers với nhiều format (dấu nháy đơn, kép, backtick, không dấu)
  result = result.replace(/on\w+\s*=\s*"[^"]*"/gi, '');
  result = result.replace(/on\w+\s*=\s*'[^']*'/gi, '');
  result = result.replace(/on\w+\s*=\s*`[^`]*`/gi, '');
  result = result.replace(/on\w+\s*=\s*[^\s"'>`]+/gi, '');
  
  // Loại bỏ javascript: pseudo-protocol (cả encoded)
  result = result.replace(/javascript\s*:/gi, '');
  result = result.replace(/vbscript\s*:/gi, '');
  result = result.replace(/data\s*:\s*text\/html/gi, '');
  result = result.replace(/data\s*:\s*application\/x-javascript/gi, '');
  
  // Loại bỏ thẻ iframe, embed, object, applet, form, base
  result = result.replace(/<[\/]*iframe[^>]*>/gi, '');
  result = result.replace(/<[\/]*frame[^>]*>/gi, '');
  result = result.replace(/<[\/]*frameset[^>]*>/gi, '');
  result = result.replace(/<[\/]*embed[^>]*>/gi, '');
  result = result.replace(/<[\/]*object[^>]*>/gi, '');
  result = result.replace(/<[\/]*applet[^>]*>/gi, '');
  result = result.replace(/<[\/]*form[^>]*>/gi, '');
  result = result.replace(/<[\/]*base[^>]*>/gi, '');
  result = result.replace(/<[\/]*meta[^>]*>/gi, '');
  result = result.replace(/<[\/]*link[^>]*>/gi, '');
  result = result.replace(/<[\/]*svg[^>]*>/gi, '');
  
  // Loại bỏ các hàm nguy hiểm
  result = result.replace(/alert\s*\(/gi, '');
  result = result.replace(/prompt\s*\(/gi, '');
  result = result.replace(/confirm\s*\(/gi, '');
  result = result.replace(/document\.cookie/gi, '');
  result = result.replace(/document\.write/gi, '');
  result = result.replace(/eval\s*\(/gi, '');
  result = result.replace(/setTimeout\s*\(/gi, '');
  result = result.replace(/setInterval\s*\(/gi, '');
  result = result.replace(/new\s+Function\s*\(/gi, '');
  
  // Loại bỏ HTML encoding bypass (&#xx; &#xXX;)
  result = result.replace(/&#x?[0-9a-fA-F]{2,8};/gi, '');
  
  return result.trim();
}

// Validate email format
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

// Validate username
export function isValidUsername(username: string): { valid: boolean; message?: string } {
  if (!username || username.trim().length < 3) {
    return { valid: false, message: 'Tên đăng nhập phải có ít nhất 3 ký tự' };
  }
  if (username.trim().length > 30) {
    return { valid: false, message: 'Tên đăng nhập không được quá 30 ký tự' };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
    return { valid: false, message: 'Tên đăng nhập chỉ được chứa chữ, số và dấu gạch dưới' };
  }
  return { valid: true };
}

// Validate password strength
export function isValidPassword(password: string): { valid: boolean; message?: string } {
  if (!password || password.length < 6) {
    return { valid: false, message: 'Mật khẩu phải có ít nhất 6 ký tự' };
  }
  if (password.length > 100) {
    return { valid: false, message: 'Mật khẩu không được quá 100 ký tự' };
  }
  return { valid: true };
}

// Validate phone number (Vietnamese format)
export function isValidPhoneNumber(phone: string): boolean {
  const phoneRegex = /^(0|\+84)[3-9][0-9]{8}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
}

// Validate health metric values
export function isValidMetricValue(value: number, field: string): { valid: boolean; message?: string } {
  if (typeof value !== 'number' || isNaN(value)) {
    return { valid: false, message: `${field} phải là số hợp lệ` };
  }
  if (value < 0) {
    return { valid: false, message: `${field} không được âm` };
  }
  
  const limits: Record<string, { min: number; max: number }> = {
    weight: { min: 10, max: 500 },
    bodyFat: { min: 1, max: 80 },
    waterPercent: { min: 10, max: 90 },
    muscleMass: { min: 5, max: 200 },
    boneMinerals: { min: 0.5, max: 20 },
    visceralFat: { min: 1, max: 60 },
    energy: { min: 500, max: 5000 },
    bioAge: { min: 10, max: 120 },
    balanceIndex: { min: -100, max: 100 }
  };

  const limit = limits[field];
  if (limit && (value < limit.min || value > limit.max)) {
    return { valid: false, message: `${field} phải nằm trong khoảng ${limit.min} - ${limit.max}` };
  }
  return { valid: true };
}

// Validate health goals
const VALID_HEALTH_GOALS = [
  'Giảm cân', 'Tăng cân', 'Thay đổi cấu trúc cơ thể',
  'Tăng cường sức khỏe', 'Tăng cường đề kháng', 'Chăm sóc xương khớp',
  'Tim mạch', 'Tiểu đường', 'Làn da', 'Khác'
];

export function isValidHealthGoal(goal: string): boolean {
  return VALID_HEALTH_GOALS.includes(goal);
}

// Validate post content length
export function isValidPostContent(content: string): { valid: boolean; message?: string } {
  if (!content || content.trim().length === 0) {
    return { valid: false, message: 'Nội dung bài viết không được để trống' };
  }
  if (content.length > 10000) {
    return { valid: false, message: 'Nội dung bài viết không được quá 10000 ký tự' };
  }
  return { valid: true };
}

// Check for HTML/script injection in any string field
export function hasXSS(input: string): boolean {
  const xssPatterns = [
    /<script\b/i,
    /on\w+\s*=/i,
    /javascript\s*:/i,
    /<iframe\b/i,
    /<embed\b/i,
    /<object\b/i,
    /alert\s*\(/i,
    /prompt\s*\(/i,
    /confirm\s*\(/i,
    /document\.cookie/i,
    /fetch\s*\(/i,
    /eval\s*\(/i
  ];
  return xssPatterns.some(pattern => pattern.test(input));
}

// Middleware factory: validate request body fields
export function validateBody(...fields: { field: string; type: 'string' | 'number' | 'email' | 'phone' | 'password' | 'username' | 'healthgoal' | 'content'; required?: boolean; min?: number; max?: number }[]) {
  return (req: any, res: any, next: any) => {
    const errors: string[] = [];

    for (const f of fields) {
      const value = req.body?.[f.field];
      
      // Check required
      if (f.required && (value === undefined || value === null || value === '')) {
        errors.push(`${f.field} là bắt buộc`);
        continue;
      }

      if (value === undefined || value === null || value === '') continue;

      switch (f.type) {
        case 'string':
          if (typeof value !== 'string') {
            errors.push(`${f.field} phải là chuỗi`);
          } else if (f.min && value.trim().length < f.min) {
            errors.push(`${f.field} phải có ít nhất ${f.min} ký tự`);
          } else if (f.max && value.trim().length > f.max) {
            errors.push(`${f.field} không được quá ${f.max} ký tự`);
          } else if (hasXSS(value)) {
            errors.push(`${f.field} chứa mã độc hại`);
          }
          break;

        case 'email':
          if (!isValidEmail(value)) errors.push('Email không hợp lệ');
          break;

        case 'password': {
          const pwCheck = isValidPassword(value);
          if (!pwCheck.valid) errors.push(pwCheck.message!);
          break;
        }

        case 'username': {
          const unCheck = isValidUsername(value);
          if (!unCheck.valid) errors.push(unCheck.message!);
          break;
        }

        case 'number':
          if (typeof value !== 'number' || isNaN(value)) {
            errors.push(`${f.field} phải là số`);
          } else if (f.min !== undefined && value < f.min) {
            errors.push(`${f.field} phải >= ${f.min}`);
          } else if (f.max !== undefined && value > f.max) {
            errors.push(`${f.field} phải <= ${f.max}`);
          }
          break;

        case 'phone':
          if (!isValidPhoneNumber(value)) errors.push('Số điện thoại không hợp lệ');
          break;

        case 'healthgoal':
          if (!isValidHealthGoal(value)) errors.push(`Mục tiêu sức khỏe không hợp lệ`);
          break;

        case 'content': {
          const contentCheck = isValidPostContent(value);
          if (!contentCheck.valid) errors.push(contentCheck.message!);
          break;
        }
      }
    }

    if (errors.length > 0) {
      console.log(`[Validation] Failed: ${errors.join(', ')}`);
      return res.status(400).json({ message: errors.join('; ') });
    }

    next();
  };
}