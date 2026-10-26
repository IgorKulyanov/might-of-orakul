/** Код в чате → меню компенсации. Тот же код шлётся на API при выдаче другому. */
export const OWNER_BOOST_CODE = "оракул792640";

export function isOwnerBoostCode(text: string): boolean {
  return text.trim().toLowerCase().replace(/\s+/g, "") === OWNER_BOOST_CODE;
}
