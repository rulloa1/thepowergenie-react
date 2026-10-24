import { describe, expect, it } from 'vitest';
import {
  customerObjectPath,
  fillWorkflowTemplate,
  optionBObjectPath,
  parseOptionBWorkflow,
  telHref,
  type WorkflowLead,
} from './optionB';

const lead: WorkflowLead = {
  name: 'Alex Morgan',
  address: '1 Example Street',
  accountNumber: '100200300',
  meterNumber: 'MTR1',
  phone: null,
  pastDue: 12.5,
  currentCharges: 40,
  amount: 52.5,
  tdu: 'Example Utility',
};

describe('option B private files', () => {
  it('accepts only this lead’s folder', () => {
    expect(optionBObjectPath('cust_example')).toBe('customers/cust_example/option-b.json');
    expect(customerObjectPath('cust_example', 'customers/cust_example/solar-plan.jpg')).toBe('customers/cust_example/solar-plan.jpg');
    expect(customerObjectPath('cust_example', 'customers/other/solar-plan.jpg')).toBeNull();
    expect(customerObjectPath('cust_example', 'customers/cust_example/../solar-plan.jpg')).toBeNull();
    expect(customerObjectPath('cust_example', 'https://files.example/solar-plan.jpg')).toBeNull();
    expect(customerObjectPath('bad/id', 'customers/bad/id/solar-plan.jpg')).toBeNull();
    expect(optionBObjectPath('')).toBeNull();
  });

  it('fills personal details from the lead and ignores other braces', () => {
    const filled = fillWorkflowTemplate(
      'Account {{accountNumber}} at {{address}} owes {{pastDue}} of {{totalDue}}. Phone {{phone}}. {not a token}.',
      lead,
    );
    expect(filled).toContain('100200300');
    expect(filled).toContain('1 Example Street');
    expect(filled).toContain('$12.50');
    expect(filled).toContain('$52.50');
    expect(filled).toContain('the phone on file');
    expect(filled).toContain('{not a token}');
  });

  it('rejects workflow files that point outside the lead folder', () => {
    const raw = JSON.stringify({
      title: 'Option B',
      subtitle: 'Storage',
      documents: [
        { id: 'plan', label: 'Plan', path: 'customers/someone-else/solar-plan.jpg', preview: true },
        { id: 'ok', label: 'Ok', path: 'customers/cust_example/solar-plan.jpg' },
      ],
      steps: [
        { id: 'step-1', title: 'Open', description: 'See {{address}}.', documentId: 'plan', actionLabel: 'Open' },
        { id: 'step-2', title: 'Call', description: 'Call about {{accountNumber}}.', phone: '8005550100', actionLabel: 'Call' },
      ],
    });
    const parsed = parseOptionBWorkflow(raw, 'cust_example');
    expect(parsed?.documents.map((document) => document.id)).toEqual(['ok']);
    expect(parsed?.steps[0].documentId).toBeNull();
    expect(parsed?.steps[1].phone).toBe('8005550100');
  });

  it('drops javascript links and unusable phone numbers', () => {
    expect(telHref('8005550100')).toBe('tel:8005550100');
    expect(telHref('+1 (800) 555-0100')).toBe('tel:+18005550100');
    expect(telHref('javascript:alert(1)')).toBeNull();
    expect(telHref('123')).toBeNull();
    expect(parseOptionBWorkflow('not json', 'cust_example')).toBeNull();
  });
});
