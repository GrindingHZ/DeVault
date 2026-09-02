import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ItemPhotograph } from './item-photograph';

describe('ItemPhotograph', () => {
  it('shows the photograph when there is one', () => {
    render(<ItemPhotograph src="/api/v1/receipts/r1/photo" alt="Omega Speedmaster" />);
    expect(screen.getByAltText('Omega Speedmaster')).toBeTruthy();
  });

  /* On the dark scope the sunken surface is within a shade of the page
     ground, so an empty box read as a hole in the layout. A placeholder has
     to look like a placeholder. */
  it('says there is no photograph rather than leaving a gap', () => {
    render(<ItemPhotograph src={null} alt="Omega Speedmaster" />);
    expect(screen.getByRole('img', { name: 'No photograph of Omega Speedmaster' })).toBeTruthy();
  });

  it('reserves the same space either way, so a late photograph shifts nothing', () => {
    const withPhoto = render(<ItemPhotograph src="/photo" alt="A" size="row" />);
    const photoClass = withPhoto.container.querySelector('img')?.className ?? '';
    withPhoto.unmount();

    const without = render(<ItemPhotograph src={null} alt="A" size="row" />);
    const placeholderClass = without.container.firstElementChild?.className ?? '';
    expect(photoClass).toContain('h-16 w-16');
    expect(placeholderClass).toContain('h-16 w-16');
  });
});
