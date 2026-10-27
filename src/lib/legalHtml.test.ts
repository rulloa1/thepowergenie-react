import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { describe, expect, it } from 'vitest';
import LegalFooter from '../components/LegalFooter';
import {
  SMS_CARRIER_LIABILITY,
  SMS_FREQUENCY,
  SMS_NO_SHARE_SENTENCE,
  SMS_PROGRAM_DESCRIPTION,
  SMS_PROGRAM_NAME,
  SMS_RATES,
  SMS_STOP_HELP,
} from './legal';
import PrivacyPage from '../pages/PrivacyPage';
import TermsPage from '../pages/TermsPage';

function html(page: React.ComponentType) {
  return renderToStaticMarkup(
    React.createElement(React.Fragment, null, React.createElement(page), React.createElement(LegalFooter)),
  );
}

describe('crawlable legal markup', () => {
  it('states what the privacy policy collects, how it is used, and the A2P mobile sentence', () => {
    const privacy = html(PrivacyPage);
    expect(privacy).toContain('Privacy Policy');
    expect(privacy).toContain('Rory Ulloa');
    expect(privacy).toContain('Houston, Texas');
    expect(privacy).toContain('partnership with Sunrun');
    expect(privacy).toContain('name, phone, email, address, uploaded electric bills and usage data, and booking details');
    expect(privacy).toContain('schedule your savings consult');
    expect(privacy).toContain('savings estimate');
    expect(privacy).toContain('Sunrun representative handling your consult');
    expect(privacy).toContain('over HTTPS');
    expect(privacy).toContain(SMS_NO_SHARE_SENTENCE);
    expect(privacy).toContain('Reply STOP to opt out of text messages');
    expect(privacy).toContain('roryulloa@gmail.com');
    expect(privacy).toContain('281-323-0450');
    expect(privacy).toContain('href="/privacy">Privacy Policy');
    expect(privacy).toContain('href="/terms">Terms');
    expect(privacy).not.toMatch(new RegExp(['Fer' + 'rell', 'cust_' + 'patricia', 'Hanna' + ' Ward'].join('|')));
  });

  it('links the four launch pages from the footer without touching the app brand routes', () => {
    const footer = renderToStaticMarkup(React.createElement(LegalFooter));
    expect(footer).toContain('href="/launch/gas-genie">Gas Genie');
    expect(footer).toContain('href="/launch/celebrity-solar">Celebrity Solar');
    expect(footer).toContain('href="/launch/hip-hop-solar">Hip Hop Solar');
    expect(footer).toContain('href="/sport-and-solar">Sport &amp; Solar');
    expect(footer).toContain('href="/privacy">Privacy Policy');
  });

  it('includes the Power Genie Alerts disclosures and a privacy link', () => {
    const terms = html(TermsPage);
    expect(terms).toContain('Terms &amp; Conditions');
    expect(terms).toContain(SMS_PROGRAM_NAME);
    expect(terms).toContain(SMS_PROGRAM_DESCRIPTION);
    expect(terms).toContain(SMS_FREQUENCY);
    expect(terms).toContain(SMS_RATES);
    expect(terms).toContain(SMS_STOP_HELP);
    expect(terms).toContain(SMS_CARRIER_LIABILITY);
    expect(terms).toContain('href="/privacy"');
    expect(terms).toContain('roryulloa@gmail.com');
    expect(terms).toContain('281-323-0450');
    expect(terms).toContain('>Privacy Policy<');
    expect(terms).not.toMatch(new RegExp(['Fer' + 'rell', 'cust_' + 'patricia', 'Hanna' + ' Ward'].join('|')));
  });
});
