/**
 * Kiểm tra user có thuộc group với tên cho trước không
 * @param user - User object (phải có userGroups field)
 * @param groupName - Tên group cần kiểm tra (không phân biệt hoa thường)
 * @returns boolean
 */
export function hasGroup(user: any, groupName: string): boolean {
  const groups = user?.userGroups || [];
  return groups.some((g: any) =>
    (g.name || g).toString().toLowerCase() === groupName.toLowerCase()
  ) ?? false;
}

/**
 * Lấy danh sách tên group của user
 */
export function getUserGroupNames(user: any): string[] {
  const groups = user?.userGroups || [];
  return groups.map((g: any) => g.name || g);
}