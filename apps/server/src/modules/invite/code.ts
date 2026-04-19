/**
 * 邀请码生成 / 格式化 / 归一化。
 *
 * 约定：
 *   - 归一化形式：全大写、无分隔符，例 "ABCDEFGH"
 *   - 展示形式：每 4 位插入一个 "-"，例 "ABCD-EFGH"
 *   - 存储：DB 里只存归一化形式
 *
 * 不引入 nanoid（项目约定，见 apps/server/CLAUDE.md）。
 * 思路与 lib/cdkey-code.ts 一致但不复用——两模块未来演进方向可能分化。
 */

// 32 字符字母表，去掉歧义字符 0 / 1 / I / L / O
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const ALPHABET_REGEX = /^[23456789A-HJ-KM-NP-Z]+$/;

/** 生成 length 位归一化邀请码。length 必须是 4 的倍数。 */
export function generateInviteCode(length = 8): string {
  if (length <= 0 || length % 4 !== 0) {
    throw new Error("invite code length must be a positive multiple of 4");
  }
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! & 0x1f];
  }
  return out;
}

/** 展示用：每 4 位插入 "-"（末段不跟分隔符）。 */
export function formatInviteCode(normalized: string): string {
  let out = "";
  for (let i = 0; i < normalized.length; i++) {
    out += normalized[i];
    if ((i + 1) % 4 === 0 && i < normalized.length - 1) out += "-";
  }
  return out;
}

/** 用户输入归一化：trim + 大写 + 去 "-" 和空白。 */
export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[-\s]/g, "");
}

/**
 * 合法性检查（仅看字符集和长度）。不查 DB。
 * 接受含 "-" 和大小写混杂的原始输入——内部会先 normalize。
 */
export function isWellFormedInviteCode(raw: string): boolean {
  const s = normalizeInviteCode(raw);
  if (s.length === 0 || s.length > 24) return false;
  if (s.length % 4 !== 0) return false;
  return ALPHABET_REGEX.test(s);
}
