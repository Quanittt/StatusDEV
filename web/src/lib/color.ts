const HEX = /^#[0-9a-fA-F]{6}$/

export const DEFAULT_BRAND = '#8a4b25'

// brand_color вводить власник, тому приймаємо тільки #RRGGBB, решту замінюємо на колір StatusDEV.
export const safeBrandColor = (c: string | null | undefined) => (c && HEX.test(c) ? c : DEFAULT_BRAND)

function luminance(hex: string) {
  const ch = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

const ratio = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

// Білий або майже чорний текст: що контрастніше на кольорі бренду (WCAG).
export function textOn(bg: string) {
  return ratio(bg, '#ffffff') >= ratio(bg, '#171717') ? '#ffffff' : '#171717'
}
