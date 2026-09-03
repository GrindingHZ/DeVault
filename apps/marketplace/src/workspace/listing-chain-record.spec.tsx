import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ListingChainRecord } from './listing-chain-record';

const record = {
  pledgeObjectId: '0x4e854376a1b2c3d4e5f60718293a4b5c6d7e8f9011223344556677889bd282',
  receiptObjectId: '0x9bd2820f1e2d3c4b5a69788796a5b4c3d2e1f00112233445566778899aabbcc',
  borrowerAddress: '0x4ec48a00b3ec12a2203aa9871735dd4e1b0f584972aaaf024b332e8b0056dc2b',
};

describe('ListingChainRecord', () => {
  it('opens the pledge, the receipt and the borrower on the explorer', () => {
    render(<ListingChainRecord {...record} />);
    expect(screen.getByTestId('listing-chain-object').getAttribute('href')).toContain(
      `/object/${record.pledgeObjectId}`,
    );
    expect(screen.getByTestId('listing-chain-receipt').getAttribute('href')).toContain(
      `/object/${record.receiptObjectId}`,
    );
    expect(screen.getByTestId('listing-chain-borrower').getAttribute('href')).toContain(
      `/account/${record.borrowerAddress}`,
    );
  });

  /* A hash speaks for nothing on its own. Each record says what it is before
     it says where it is. */
  it('names each record in words', () => {
    render(<ListingChainRecord {...record} />);
    expect(screen.getByText('Pledge')).toBeTruthy();
    expect(screen.getByText('Vault receipt')).toBeTruthy();
    expect(screen.getByText('Borrower')).toBeTruthy();
  });

  it('says so when the chain does not know the receipt', () => {
    render(<ListingChainRecord {...record} receiptObjectId={null} />);
    expect(screen.queryByTestId('listing-chain-receipt')).toBeNull();
    expect(screen.getByText('Not on chain')).toBeTruthy();
  });
});
