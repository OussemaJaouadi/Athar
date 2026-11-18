import { describe, expect, test } from 'bun:test'
import { looksParked, pageFacts } from './page-facts'

describe('pageFacts', () => {
  test('reads title and description from a normal page', () => {
    const html = `<!doctype html><html><head><title>Verse - Legal tech</title>
      <meta name="description" content="We draft contracts in minutes."></head><body>x</body></html>`
    expect(pageFacts(html)).toEqual({ title: 'Verse - Legal tech', summary: 'We draft contracts in minutes.' })
  })

  test('reads content before or after name', () => {
    expect(pageFacts('<meta content="First" name="description">').summary).toBe('First')
    expect(pageFacts('<meta name="description" content="Second">').summary).toBe('Second')
  })

  test('accepts single quotes', () => {
    expect(pageFacts("<meta name='description' content='Single quoted'>").summary).toBe('Single quoted')
    expect(pageFacts("<title data-x='1'>Quoted title</title>").title).toBe('Quoted title')
  })

  test('accepts upper-case tags and attribute names', () => {
    const html = '<HTML><HEAD><TITLE>Loud</TITLE><META NAME="Description" CONTENT="Shouting"></HEAD>'
    expect(pageFacts(html)).toEqual({ title: 'Loud', summary: 'Shouting' })
  })

  test('title spanning lines with attributes on the tag', () => {
    const html = '<title lang="en">\n  Multi\n    line   title\n</title>'
    expect(pageFacts(html).title).toBe('Multi line title')
  })

  test('title tag does not match longer tag names', () => {
    expect(pageFacts('<titles>nope</titles>').title).toBeNull()
  })

  test('decodes named and numeric entities', () => {
    const html = '<title>Tom &amp; Jerry &lt;3 &gt; &quot;hi&quot; &#39;x&#39; &apos;y&apos; a&nbsp;b &#233; &#xE9; &#x1F600;</title>'
    expect(pageFacts(html).title).toBe('Tom & Jerry <3 > "hi" \'x\' \'y\' a b é é 😀')
  })

  test('a double-encoded entity is decoded once', () => {
    expect(pageFacts('<title>&amp;lt;b&amp;gt;</title>').title).toBe('&lt;b&gt;')
  })

  test('an invalid numeric entity is left as written', () => {
    expect(pageFacts('<title>&#99999999;</title>').title).toBe('&#99999999;')
  })

  test('og:description is used when there is no meta description', () => {
    const html = '<meta property="og:description" content="From Open Graph"><meta name="twitter:description" content="From Twitter">'
    expect(pageFacts(html).summary).toBe('From Open Graph')
  })

  test('meta description is preferred over og:description', () => {
    const html = '<meta property="og:description" content="OG"><meta name="description" content="Meta wins">'
    expect(pageFacts(html).summary).toBe('Meta wins')
  })

  test('an empty description falls through to the next source', () => {
    const html = '<meta name="description" content="   "><meta name="twitter:description" content="Twitter line">'
    expect(pageFacts(html).summary).toBe('Twitter line')
  })

  test('nothing found gives nulls', () => {
    expect(pageFacts('<html><body><p>Hello</p></body></html>')).toEqual({ title: null, summary: null })
  })

  test('empty string gives nulls', () => {
    expect(pageFacts('')).toEqual({ title: null, summary: null })
  })

  test('a whitespace-only title is null', () => {
    expect(pageFacts('<title>  \n </title>').title).toBeNull()
  })

  test('a 500-character description is cut at a space and ends with an ellipsis', () => {
    const long = 'abcdefghi '.repeat(50).trim()
    expect(long.length).toBe(499)
    const summary = pageFacts(`<meta name="description" content="${long}">`).summary ?? ''
    expect(summary.endsWith('…')).toBe(true)
    const body = summary.slice(0, -1)
    expect(body.length).toBeLessThanOrEqual(400)
    expect(body.endsWith(' ')).toBe(false)
    expect(long.startsWith(body)).toBe(true)
    expect(body.length).toBeGreaterThan(380)
  })

  test('a long title is cut at 200 characters with an ellipsis', () => {
    const title = pageFacts(`<title>${'word '.repeat(100)}</title>`).title ?? ''
    expect(title.endsWith('…')).toBe(true)
    expect(title.length).toBeLessThanOrEqual(201)
    expect(title.startsWith('word word')).toBe(true)
  })

  test('a description with no space to cut at is cut hard with an ellipsis', () => {
    const summary = pageFacts(`<meta name="description" content="${'x'.repeat(500)}">`).summary ?? ''
    expect(summary).toBe('x'.repeat(400) + '…')
  })

  test('garbage input never throws', () => {
    const inputs = [
      null as unknown as string,
      undefined as unknown as string,
      42 as unknown as string,
      '<title>never closed',
      '<meta name="description" content="unclosed',
      '<meta',
      '<<<>>>"\'=&#;&;&&',
      '\u0000￿<title\u0000>x</title>',
    ]
    for (const input of inputs) {
      expect(() => pageFacts(input)).not.toThrow()
      const facts = pageFacts(input)
      expect(facts.title === null || typeof facts.title === 'string').toBe(true)
      expect(facts.summary === null || typeof facts.summary === 'string').toBe(true)
    }
    expect(pageFacts('<title>never closed').title).toBeNull()
    expect(pageFacts('<meta name="description" content="unclosed').summary).toBeNull()
  })

  test('only the first 100,000 characters are read', () => {
    const html = `${' '.repeat(100_000)}<title>Too late</title>`
    expect(pageFacts(html).title).toBeNull()
  })

  test('a > inside a quoted content does not end the tag', () => {
    expect(pageFacts('<meta name="description" content="Price > cost">').summary).toBe('Price > cost')
  })
})

describe('looksParked', () => {
  test('a domain-for-sale title is parked', () => {
    expect(looksParked({ title: 'HugeDomains.com - Slidzo.com is for sale', summary: null })).toBe(true)
  })

  test('a buy-this-domain summary is parked', () => {
    expect(looksParked({ title: null, summary: 'Buy this domain today' })).toBe(true)
  })

  test('French for-sale wording is parked', () => {
    expect(looksParked({ title: 'Domaine à vendre', summary: null })).toBe(true)
    expect(looksParked({ title: null, summary: 'Ce domaine est à vendre' })).toBe(true)
  })

  test('suspended and expired pages are parked', () => {
    expect(looksParked({ title: 'Account Suspended', summary: null })).toBe(true)
    expect(looksParked({ title: null, summary: 'This Website Expired last month' })).toBe(true)
  })

  test('an ordinary page is not parked', () => {
    expect(looksParked({ title: 'Verse - Legal tech', summary: 'We draft contracts in minutes.' })).toBe(false)
  })

  test('coming soon is not parked', () => {
    expect(looksParked({ title: 'Coming soon', summary: 'Our app is coming soon' })).toBe(false)
  })

  test('nulls are not parked', () => {
    expect(looksParked({ title: null, summary: null })).toBe(false)
  })
})

describe('parked phrases are whole words', () => {
  test('a longer word that contains one is not a parked page', () => {
    expect(looksParked({ title: 'Sedona Travel, guided tours', summary: null })).toBe(false)
  })
  test('the phrase itself still counts', () => {
    expect(looksParked({ title: 'This domain is listed on Sedo', summary: null })).toBe(true)
    expect(looksParked({ title: 'HugeDomains.com', summary: null })).toBe(true)
  })
})
