import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Page, PageHeader, PageSection } from './page';

describe('PageHeader', () => {
  /* Before this, no screen in the product had a heading, so nothing told a
     reader or a screen reader what they were looking at. */
  it('gives the screen its one heading', () => {
    render(<PageHeader title="My receipts" />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('My receipts');
  });

  it('carries a description and actions when given them', () => {
    render(
      <PageHeader
        title="Wallet"
        description="What you can spend and what is committed."
        actions={<button type="button">Deposit</button>}
      />,
    );
    expect(screen.getByText('What you can spend and what is committed.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Deposit' })).toBeTruthy();
  });

  it('omits both when not given them', () => {
    const { container } = render(<PageHeader title="Wallet" />);
    expect(container.querySelectorAll('p')).toHaveLength(0);
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});

describe('Page', () => {
  it('fills the window by default', () => {
    const { container } = render(
      <Page>
        <p>content</p>
      </Page>,
    );
    expect(container.firstElementChild?.className).toContain('max-w-[110rem]');
  });

  it('caps the measure when asked to read', () => {
    const { container } = render(
      <Page width="reading">
        <p>content</p>
      </Page>,
    );
    expect(container.firstElementChild?.className).toContain('max-w-3xl');
  });
});

describe('PageSection', () => {
  it('renders a heading below the page heading, not another h1', () => {
    render(
      <PageSection title="History">
        <p>rows</p>
      </PageSection>,
    );
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('History');
  });

  it('renders bare content when it has no title', () => {
    render(
      <PageSection>
        <p>rows</p>
      </PageSection>,
    );
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('rows')).toBeTruthy();
  });
});
