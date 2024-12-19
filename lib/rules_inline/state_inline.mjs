// Inline parser state

import Token from '../token.mjs'
import { isWhiteSpace, isPunctChar, isMdAsciiPunct } from '../common/utils.mjs'

function StateInline (src, md, env, outTokens) {
  this.src = src
  this.env = env
  this.md = md
  this.tokens = outTokens
  this.tokens_meta = Array(outTokens.length)

  this.pos = 0
  this.posMax = this.src.length
  this.level = 0
  this.pending = ''
  this.pendingLevel = 0

  // Stores { start: end } pairs. Useful for backtrack
  // optimization of pairs parse (emphasis, strikes).
  this.cache = {}

  // List of emphasis-like delimiters for current tag
  this.delimiters = []

  // Stack of delimiter lists for upper level tags
  this._prev_delimiters = []

  // backtick length => last seen position
  this.backticks = {}
  this.backticksScanned = false

  // Counter used to disable inline linkify-it execution
  // inside <a> and markdown links
  this.linkLevel = 0
}

// Flush pending text
//
StateInline.prototype.pushPending = function () {
  const token = new Token('text', '', 0)
  token.content = this.pending
  token.level = this.pendingLevel
  this.tokens.push(token)
  this.pending = ''
  return token
}

// Push new token to "stream".
// If pending text exists - flush it as text token
//
StateInline.prototype.push = function (type, tag, nesting) {
  if (this.pending) {
    this.pushPending()
  }

  const token = new Token(type, tag, nesting)
  let token_meta = null

  if (nesting < 0) {
    // closing tag
    this.level--
    this.delimiters = this._prev_delimiters.pop()
  }

  token.level = this.level

  if (nesting > 0) {
    // opening tag
    this.level++
    this._prev_delimiters.push(this.delimiters)
    this.delimiters = []
    token_meta = { delimiters: this.delimiters }
  }

  this.pendingLevel = this.level
  this.tokens.push(token)
  this.tokens_meta.push(token_meta)
  return token
}

// Scan a sequence of emphasis-like markers, and determine whether
// it can start an emphasis sequence or end an emphasis sequence.
//
//  - start - position to scan from (it should point at a valid marker);
//  - canSplitWord - determine if these markers can be found inside a word
//
StateInline.prototype.scanDelims = function (start, canSplitWord) {
  const max = this.posMax
  const marker = this.src.charCodeAt(start)

  const lastChar = getLastCharCode(this.src, start)

  let pos = start
  while (pos < max && this.src.charCodeAt(pos) === marker) { pos++ }

  const count = pos - start

  // treat end of the line as a whitespace
  const nextChar = pos < max ? this.src.codePointAt(pos) : 0x20

  const isLastPunctChar = isMdAsciiPunct(lastChar) || isPunctChar(String.fromCodePoint(lastChar))
  const isNextPunctChar = isMdAsciiPunct(nextChar) || isPunctChar(String.fromCodePoint(nextChar))

  const isLastWhiteSpace = isWhiteSpace(lastChar)
  const isNextWhiteSpace = isWhiteSpace(nextChar)

  const left_flanking =
    !isNextWhiteSpace && (!isNextPunctChar || isLastWhiteSpace || isLastPunctChar)
  const right_flanking =
    !isLastWhiteSpace && (!isLastPunctChar || isNextWhiteSpace || isNextPunctChar)

  const can_open  = left_flanking  && (canSplitWord || !right_flanking || isLastPunctChar)
  const can_close = right_flanking && (canSplitWord || !left_flanking  || isNextPunctChar)

  return { can_open, can_close, length: count }

  function getLastCharCode (str, pos) {
    // treat beginning of the line as a whitespace
    if (pos <= 0) { return 0x20 }
    const charCode = str.codePointAt(pos - 1)
    // not low surrogates (BMP)
    // undefined & 0xFC00 = 0
    if ((charCode & 0xFC00) !== 0xDC00) { return charCode }

    // undefined if out of range (leading stray low surrogates)
    const codePoint = str.codePointAt(pos - 2)
    // undefined > 0xffff = false, so we don't need extra check here
    return codePoint > 0xffff ? codePoint : charCode
  }
}

// re-export Token class to use in block rules
StateInline.prototype.Token = Token

export default StateInline
