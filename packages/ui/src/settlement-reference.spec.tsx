import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettlementReference } from './settlement-reference';

describe('SettlementReference', () => {
  it('shows a ledger reference as copyable text, never a link', () => {
    render(
      <SettlementReference
        value={{ kind: 'ledger', reference: '01J0ABCDEF1234567890' }}
        network={null}
      />,
    );
    const node = screen.getByTestId('settlement-reference');
    expect(node.tagName).toBe('SPAN');
    expect(node.getAttribute('title')).toBe('01J0ABCDEF1234567890');
    expect(node.textContent).toBe('01J0AB...7890');
  });

  it('links a chain digest to the explorer on a public network', () => {
    render(
      <SettlementReference
        value={{ kind: 'chain', reference: 'DiGeStDiGeStDiGeStDiGeStDiGeSt' }}
        network="testnet"
      />,
    );
    const link = screen.getByTestId('settlement-reference');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe(
      'https://suiscan.xyz/testnet/tx/DiGeStDiGeStDiGeStDiGeStDiGeSt',
    );
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('data-kind')).toBe('chain');
  });

  it('shows a chain digest as text on a local network with no explorer', () => {
    render(
      <SettlementReference
        value={{ kind: 'chain', reference: 'LOCALDIGEST123456' }}
        network="localnet"
      />,
    );
    const node = screen.getByTestId('settlement-reference');
    expect(node.tagName).toBe('SPAN');
    expect(node.getAttribute('title')).toBe('LOCALDIGEST123456');
  });
});
