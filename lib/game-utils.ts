import { Token } from './tokens'

export function randInt(max: number) {
  return Math.floor(Math.random() * max)
}

export function makeRandom5(tokens: Token[]): string[] {
  if (!tokens || tokens.length === 0) return []
  return Array.from({ length: 5 }, () => tokens[randInt(tokens.length)].id)
}

