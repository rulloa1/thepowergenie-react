/**
 * Writes crawlable /privacy and /terms documents into the Vite build.
 * Vercel rewrites those paths to these files, so a direct request returns the
 * policy text without running JavaScript. The same app bundle still mounts
 * and renders the page. This is not a serverless function.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import LegalFooter from '../src/components/LegalFooter'
import {
  SMS_CARRIER_LIABILITY,
  SMS_FREQUENCY,
  SMS_NO_SHARE_SENTENCE,
  SMS_PROGRAM_DESCRIPTION,
  SMS_PROGRAM_NAME,
  SMS_RATES,
  SMS_STOP_HELP,
} from '../src/lib/legal'
import PrivacyPage from '../src/pages/PrivacyPage'
import TermsPage from '../src/pages/TermsPage'

const BANNED = [
  'Ferrell',
  'Hanna Ward',
  'Hannah Ward',
  '206732844',
  'AN14864224',
  '23929051',
  'cust_patricia',
  'patricia-ferrell',
]

const dist = join(process.cwd(), 'dist')
const shell = readFileSync(join(dist, 'index.html'), 'utf8')

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function pageHtml(path: '/privacy' | '/terms', title: string, description: string, markup: string): string {
  const canonical = `https://thepowergenie.theroyeffect.com${path}`
  let html = shell
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeAttr(title)}</title>`)
  html = html.replace(
    /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${escapeAttr(description)}" />`,
  )
  html = html.replace(
    /<meta property="og:title" content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${escapeAttr(title)}" />`,
  )
  html = html.replace(
    /<meta property="og:description" content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
  )
  html = html.replace(
    '</head>',
    `    <link rel="canonical" href="${canonical}" />\n    <meta name="robots" content="index, follow" />\n  </head>`,
  )
  if (!html.includes('<div id="root"></div>')) {
    throw new Error('built index.html is missing an empty #root')
  }
  return html.replace('<div id="root"></div>', `<div id="root">${markup}</div>`)
}

function markup(page: 'privacy' | 'terms'): string {
  const document = page === 'privacy' ? PrivacyPage : TermsPage
  return renderToStaticMarkup(
    React.createElement(React.Fragment, null, React.createElement(document), React.createElement(LegalFooter)),
  )
}

function requirePhrases(label: string, html: string, phrases: string[]) {
  for (const phrase of phrases) {
    if (!html.includes(phrase)) throw new Error(`${label} is missing: ${phrase}`)
  }
  for (const needle of BANNED) {
    if (html.includes(needle)) throw new Error(`${label} contains customer data (${needle})`)
  }
}

const privacyMarkup = markup('privacy')
const termsMarkup = markup('terms')

requirePhrases('privacy', privacyMarkup, [
  SMS_NO_SHARE_SENTENCE,
  SMS_PROGRAM_NAME,
  SMS_PROGRAM_DESCRIPTION,
  'Rory Ulloa',
  'Houston, Texas',
  'uploaded electric bills and usage data',
  'Sunrun representative handling your consult',
  '281-323-0450',
  'roryulloa@gmail.com',
  'Reply STOP',
  'over HTTPS',
])

requirePhrases('terms', termsMarkup, [
  SMS_PROGRAM_NAME,
  SMS_PROGRAM_DESCRIPTION,
  SMS_FREQUENCY,
  SMS_RATES,
  SMS_STOP_HELP,
  SMS_CARRIER_LIABILITY,
  'href="/privacy"',
  'Privacy Policy',
  '281-323-0450',
  'roryulloa@gmail.com',
])

const privacyHtml = pageHtml(
  '/privacy',
  'Privacy Policy — The Power Genie',
  'Privacy Policy for The Power Genie, operated by Rory Ulloa in Houston, Texas. Mobile information and text messaging consent are not shared for marketing.',
  privacyMarkup,
)
const termsHtml = pageHtml(
  '/terms',
  'Terms & Conditions — The Power Genie',
  'Terms and conditions for The Power Genie, including the Power Genie Alerts text message program.',
  termsMarkup,
)

requirePhrases('privacy.html', privacyHtml, [SMS_NO_SHARE_SENTENCE, '<div id="root">'])
requirePhrases('terms.html', termsHtml, [SMS_STOP_HELP, 'href="/privacy"'])

writeFileSync(join(dist, 'privacy.html'), privacyHtml)
writeFileSync(join(dist, 'terms.html'), termsHtml)
console.log('prerendered dist/privacy.html and dist/terms.html')
