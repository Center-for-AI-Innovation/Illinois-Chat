import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../breadcrumb'

describe('Breadcrumb', () => {
  // Figma sub-page header: "Project Settings", text-sm regular, foreground.
  it('renders the current page in the Figma sub-page header style', () => {
    render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/AI-Engineering/dashboard">
              AI-Engineering
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Project Settings</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    )

    expect(
      screen.getByRole('navigation', { name: 'breadcrumb' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('list')).toHaveClass(
      'text-sm',
      'text-muted-foreground',
    )
    const page = screen.getByText('Project Settings')
    expect(page).toHaveClass('text-foreground', 'font-normal')
    expect(page).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'AI-Engineering' })).toHaveClass(
      'hover:text-foreground',
    )
  })

  // Figma ellipsis item is a 36px square with a 16px icon.
  it('renders the ellipsis as a 36px square', () => {
    render(<BreadcrumbEllipsis data-testid="ellipsis" />)

    expect(screen.getByTestId('ellipsis')).toHaveClass('size-9')
  })
})
