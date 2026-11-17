/** Validates a Brazilian CPF (11 digits, two check digits). Accepts formatted or raw input. */
export function isValidCpf(input: string): boolean {
  const digits = input.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  const nums = digits.split("").map(Number);
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += (nums[i] as number) * (len + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== nums[len]) return false;
  }
  return true;
}
